
function render(template, target, data) {
    if ( !data ) var data = {};
    var html = $.mustache($("#" + template + "-template").text(), data);
    $( "#" + target ).html(html);
}

var config = {
    db: document.location.href.split( '/' )[ 3 ],
    design: 'browser',
};

config.baseURL = "/" + config.db + "/_design/" + config.design + "/_rewrite/";

function reqOpts(opts) {
    var defaults = {
        uri: config.baseURL + "api",
        method: "GET",
        headers: {"Content-type": "application/json"},
        cache: true
    };
    return $.extend({}, defaults, opts);
}

var app = {};
app.index = function () {
    render('welcome', 'main-container');
};


var COLORS_BY_LEVEL = ['black', 'blue'];

function renderGraph(err, resp, body) {
    if (doc == "Object Not Found") {
        render("error", "link-graph", {text: "Document not found"});
        return;
    };
    var doc = JSON.parse(body);
    var docID = doc["_id"];
    var sig = sigma.init($('#link-graph')[0]);
    sig.graphProperties({
        minNodeSize: 2,
        maxNodeSize: 10});
    sig.drawingProperties({
        defaultLabelColor: '#ccc',
        font: 'Arial',
        edgeColor: 'source',
        defaultEdgeType: 'curve'
    });
    sig.addNode(doc['_id'], {x:0 , y: 0, label: doc['.type'],
                             color: COLORS_BY_LEVEL[0]});
    sig.draw();
    window.sig = sig;

    $.request({uri: config.baseURL + 'api/links/' + docID},
              function(err, resp, body) {
                  if (!err) {
                      var resp = JSON.parse(body);
                      $.each(resp.rows, function(index) {
                          var x = (0.2 * Math.sin(index / resp.rows.length * 2 * Math.PI));
                          var y = (0.2 * Math.cos(index / resp.rows.length * 2 * Math.PI));
                          try {
                              sig.addNode(this.id, {label: this.key[1],
                                                    x: x, y: y,
                                                    color: COLORS_BY_LEVEL[1]});
                              var edgeID = docID + '-' + this.id;
                              sig.addEdge(edgeID, docID, this.id);
                          } catch (e) {};
                      });
                      sig.draw();
                  }
              });
}

app.graph = function() {
    var docID = this.params['docID'];
    render('graph', 'main-container', {docID: docID});
    if (docID) {
        $.request({uri: config.baseURL + 'api/' + docID}, renderGraph);
    }
};


$(function () {
  app.s = $.sammy(function () {
    // Index of all databases
    this.get('', app.index);
    this.get("#/", app.index);
    this.get("#graph", app.graph);
    this.post("#graph", function() {
        // this is used by jump to form
        this.redirect('#graph', this.params['docID']);
    });
    this.get("#graph/:docID", app.graph);
  })
  app.s.run();
});
