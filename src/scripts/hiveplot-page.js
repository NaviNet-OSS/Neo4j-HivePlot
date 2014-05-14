var defaultInfo;
var nodeDomain;
var relDomain;
var graph;
var nodeDomainLabelMap;
var selectRelDomain;
var availNodeDomain;
var availRelDomain;
var STATUS_PROGRESS = "status-progress";
var STATUS_SUCCESS = "status-success";
var STATUS_ERROR = "status-error";
var dirtyQuery = true;
var graphPlotted = false;


$(document).ready(function() {

	// setup jQuery UI Tabs component
	$("#tabs").tabs({
		collapsible: true,
		heightStyle: "content",
	});
	$("#tabs").on({
		mouseleave: handleMouseLeftTabs,
		mouseenter: handleMouseEnteredTabs
	});
	
	// save query values in cookie on change so we can reload them when page is reloaded
	$(".queryInput").on("change", queryInputChanged).each(function(i,el) {
		var $el = $(el);
		var id = $el.attr("id");
		var cookieVal = $.cookie(id);
		if (typeof(cookieVal) != "undefined") {
			$el.val(cookieVal);
		}
	});
	
	// wire up button click handler
	$(".btnRunQuery").on("click", handleRunQuery);
	
	// wire up custom events provided by hiveplot.js component
	$("#chart").on({
		nodeMouseover: handleNodeMouseover,
		nodeMouseout: handleNodeMouseout,
		linkMouseover: handleLinkMouseover,
		linkMouseout: handleLinkMouseout
	});
	
	setDirtyQuery();
	setQueryNotRunning();
});

// when mouse leaves tab component and query has been run, then auto collpase
// so that user can see the plot
var autoCollapseTimeoutId;
function handleMouseLeftTabs() {
	if (isTabAutoCollapseArmed()) {
		autoCollapseTimeoutId = window.setTimeout(collapseTabs, 500);
	}
}

function collapseTabs() {
	//find the active tab and "click" it again to collapse
	var selectedTab = $("#tabs").tabs("option","active");
	$("a[href='#tabs-" + selectedTab + "']").click();
}

function handleMouseEnteredTabs() {
	window.clearTimeout(autoCollapseTimeoutId);
}

function isTabAutoCollapseArmed() {
	if (dirtyQuery || !graphPlotted) return false;
	
	var activeVal = $("#tabs").tabs("option", "active");
	if (activeVal === false) return false;  //already collapsed
	
	return true;
}

// save inputs in cookie
function queryInputChanged() {
	var $this = $(this);
	var id = $this.attr("id");
	var val = $this.val();
	$.cookie(id, val);

	setDirtyQuery();
}

// dynamic behavior based on query needing to be re-run or not
function setDirtyQuery() {
	$(".dirtyQuery").show();
	$(".cleanQuery").hide();
	$("#chart").empty();
	graphPlotted = false;
	dirtyQuery = true;
}

function setCleanQuery() {
	$(".dirtyQuery").hide();
	$(".cleanQuery").show();
	dirtyQuery = false;
}

// set the status message with the given class, default to "success" style
function setStatus(info, cssClass) {
	if (!info || info.length == 0) {
		$("#status").hide();
	}
	else {
		if (typeof(cssClass) == "undefined") {
			cssClass = STATUS_SUCCESS;
		}
		$("#status").show().removeClass().addClass(cssClass).text(info);
	}
}

// dynamic behavior based on whether query is running or not
function setQueryNotRunning() {
	$(".btnRunQuery").show();
	$(".spinner").hide();
}

function setQueryRunning() {
	$(".btnRunQuery").hide();
	$(".spinner").show();
}
	
function handleRunQuery() {
	runQuery();
}

function stopQuery() {
	setQueryNotRunning();
}

// This is the meat of the functionality. Build up a query and use neo4j-query.js
// to run it. Then pass the resulting graph to the hiveplot.js component to plot the result
function runQuery() {
	setQueryRunning();
	setStatus("Running query...", STATUS_PROGRESS);

	var txtParams = $("#txtParams").val();
	var params = {};
	if (typeof(txtParams) != "undefined" && txtParams.length > 0) {
		try {
			params = JSON.parse(txtParams);
			$("#txtParams").removeClass("inputError");
		}
		catch(e) {
			$("#txtParams").addClass("inputError");
			console.log("JSON params parse error: " + e);
			setStatus("JSON params parse error.", STATUS_ERROR);
			stopQuery();
			return;
		}
	}
	
	var arguments = {
					dataUri: $("#txtUri").val(),
					cypherQuery: $("#txtCypher").val(),
					queryParams: params,
					success: processQueryResult,
					error: handleQueryError
				  };

	Neo4j.Query.runQuery(arguments);
}

// display the error message and exit	
function handleQueryError(err) {
	console.log(err);
	setQueryNotRunning();
	setStatus("ERROR: " + err, STATUS_ERROR);
}
	  
// number formatting function provided by d3.js
var formatNumber = d3.format(",d");
	
// we got a result from neo4j-query.js and we now can figure out the node and
// relationship domains for the user to select what they want plotted
function processQueryResult(theGraph) {
	graph = theGraph;

	setQueryNotRunning();

	defaultInfo = "Graph contains " + formatNumber(graph.relationships.length) + " links among " + formatNumber(graph.nodes.length) + " nodes.";
	setStatus(defaultInfo);
	
	console.log(graph);

	findAvailDomains();
	setupDomainSelection();
}

// rebuild the arrays that hold the superset of domains available for plotting
function findAvailDomains() {
	availNodeDomain = [];
	availRelDomain = [];

	graph.nodes.forEach(function(node) {
		if (availNodeDomain.indexOf(node.domainKey) == -1) availNodeDomain.push(node.domainKey);
	});
	graph.relationships.forEach(function(rel) {
		if (availRelDomain.indexOf(rel.domainKey) == -1) availRelDomain.push(rel.domainKey);
	});
}

function getNodeDomainParts(domainKey) {
	return domainKey.split("-");
}

function getRelDomainParts(domainKey) {
	var parts = domainKey.split("--");
	return {
		sourceKey: parts[0],
		sourceLabels: getNodeDomainParts(parts[0]),
		targetKey: parts[2],
		targetLabels: getNodeDomainParts(parts[2]),
		type: parts[1]
	};
}

// rebuild HTML on the Nodes and Relationships tabs to allow the user to select what they want plotted
function setupDomainSelection() {

	$("#nodeDomain").off().empty();
	$("#relDomain").off().empty();

	var html = "";
	var count = 0;
	availNodeDomain.forEach(function(domain) {
		var labels = getNodeDomainParts(domain);
		count++;
		html += "<strong>Domain " + count + ", label as: </strong>";
		labels.forEach(function(label) {
			html += '<input type="radio" class="nodeDomainRadio" value="'+label+'" name="'+domain+'" id="rad'+domain+label+'" /><label class="nodeWord '+domain+' '+label+'" for="rad'+domain+label+'">'+label+'</label>&nbsp;&nbsp;';
		});
		html += '<input type="radio" class="nodeDomainRadio" value="EXCLUDE" name="'+domain+'" id="rad'+domain+'EXCLUDE" checked="checked" /><label for="rad'+domain+'EXCLUDE">(Exclude)</label>&nbsp;&nbsp;';
		// TODO: allow user to input a custom label for a given node domain
		html += "<br />\n";
	});
	$("#nodeDomain").append(html);

	html = "";
	count = 0;
	availRelDomain.forEach(function(domain) {
		var parts = getRelDomainParts(domain);
		count++;
		html += "<strong>" + count + ": </strong>";
		html += '<span id="rel'+domain+'"><input type="checkbox" class="relDomainCheckbox" checked="checked" id="chk'+domain+'" /><label id="lbl'+domain+'" for="chk'+domain+'">'+parts.sourceKey+'-[:'+parts.type+']-&gt;'+parts.targetKey+'</label></span><br />';
	});
	$("#relDomain").append(html);
	
	$(".nodeDomainRadio").on("click", handleDomainSelection);
	$(".relDomainCheckbox").on("click", handleDomainSelection);
	$("#tabs").tabs("refresh");
	
	setCleanQuery();
	
	// set the Nodes tab active
	if ($("#tabs").tabs("option","active") != 1) {
		$("#tabs").tabs("option", "active", 1);
	}
}


// Handle a change in the node or relationship domain selections, including regenerating the plot
function handleDomainSelection(e) {

	$(".nodeWord").css("color", "");
	$(".relArrow").css("color", "");
	$("#chart").empty();
	graphPlotted = false;

	// rebuild selected node domain list
	nodeDomainLabelMap = {};
	nodeDomain = [];
	availNodeDomain.forEach(function(domain) {
		var checkedVal = $("input[name='" + domain + "']:checked").val();
		if (typeof(checkedVal) != "undefined" && checkedVal != "EXCLUDE") {
			nodeDomainLabelMap[domain] = checkedVal;
			nodeDomain.push(domain);
		}
	});

	// rebuild selected relationship domain list
	relDomain = [];
	availRelDomain.forEach(function(domain) {
		var parts = getRelDomainParts(domain);
		
		if (nodeDomainLabelMap[parts.sourceKey] && nodeDomainLabelMap[parts.targetKey]) {
			$("#rel" + domain).removeClass("disabled");
			$("#lbl" + domain).html(getRelHtml(nodeDomainLabelMap[parts.sourceKey], nodeDomainLabelMap[parts.targetKey], parts.type, domain));
			if ($("#chk" + domain).is(":checked")) {
				relDomain.push(domain);
			}
		}
		else {
			$("#rel" + domain).addClass("disabled");
		}
	});
	
	// if at least 2 node domains and 1 relationship are selected, then regenerate the plot
	if (nodeDomain.length > 1 && relDomain.length > 0) {
		var args = {
			containerSelector: "#chart",
			graph: graph,
			nodeDomain: nodeDomain,
			relationshipDomain: relDomain,
			getNodeName: generateNodeName,
			getNodeLabel: getNodeLabel
		};
		
		HivePlot.Plotter.draw(args);

		// color the node and relationship text according to the colors in the plot
		nodeDomain.forEach(function(d) {
			$(".nodeWord." + d + "." + nodeDomainLabelMap[d]).css("color", HivePlot.Plotter.getNodeColor(d));
		});
		
		relDomain.forEach(function(d) {
			$(".relArrow." + d).css("color", HivePlot.Plotter.getRelationshipColor(d));
		});
		
		defaultInfo = "Showing " + formatNumber(HivePlot.Plotter.getRelationshipCount()) + " links among " + formatNumber(HivePlot.Plotter.getNodeCount()) + " nodes.";
		setStatus(defaultInfo);
		
		graphPlotted = true;  
	}
}

// helper function to generate the HTML for a relationshiop domain
function getRelHtml(sourceLabel, targetLabel, type, relDomain) {
	var html = '<span class="nodeWord '+sourceLabel+'">('+sourceLabel+')</span>';
	html += '<span class="relArrow '+relDomain+'">-[:' + type + ']-&gt;</span>';
	html += '<span class="nodeWord '+targetLabel+'">('+targetLabel+')</span>';
	return html;
}

function generateNodeName(node) {
	var label = getNodeLabel(node);

	var uriParts = node.uri.split("/");
	return label + " " + uriParts[uriParts.length-1];
}

function getNodeLabel(node) {
	var type = nodeDomainLabelMap[node.domainKey];
	if (typeof(type) == "undefined") return node.domainKey;

	return type;
}

// event handlers for mouse movement over the plot to set the status text
function handleLinkMouseover(e, rel) {
	setStatus(getNodeName(rel.startNode) + "-[:" + rel.type + "]->" + getNodeName(rel.endNode));
}

function handleLinkMouseout(e, rel) {
	setStatus(defaultInfo);
}

function handleNodeMouseover(e, node) {
	setStatus(getNodeName(node));
}

function handleNodeMouseout(e, node) {
	setStatus(defaultInfo);
}

function getNodeName(node) {
	var label = nodeDomainLabelMap[node.domainKey];
	var uriParts = node.uri.split("/");
	return "(" + label + " " + uriParts[uriParts.length - 1] + ")";
}
