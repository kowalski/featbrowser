(function($) {
    
     var defaults = {
         target: null,
         docID: null,
         limit: 3,
         maxNodes: 150,
         availableColors: ['#f9a021', '#cb0000', '#89ca00', '#c9c9c9',
                           '#0486c3', '#b4b487', '#ebe934', '#04b8b6',
                           '#93776b', '#bd7da5'],
         forceAtlasTimeout: 1500
     };

     DocumentNode = function(id, label, level, linkTo) {
         this.id = id;
         this.label = label;
         this.level = level;
         this.linkTo = [];
         if (linkTo) this.linkTo.push(linkTo);
     };

     DocumentNode.prototype.addLink = function(id, label) {
         if (this.linkTo.indexOf(id) == -1) {
             this.linkTo.push(id);
         }
     };

     window.LinkGraph = function(options) {
         options = $.extend({}, defaults, options);
         this.docID = options['docID'];
         this.target = options['target'];
         this.options = options;
         this.sigma = null;

         // id -> DocumentNode;
         this.nodes = {};
         this.countPerLevel = {};
         this.count = 0;

         // list of requests kept to know when we are done loading
         this.requests = [];

         $.request({uri: config.baseURL + 'api/' + this.docID},
                   this.handler(this.gotDocument));

     };

     LinkGraph.prototype.addNode = function(id, label, level, linkTo){
         if (this.nodes.hasOwnProperty(id)) {
             this.nodes[id].addLink(linkTo, label);
             return;
         } else {
             this.count += 1;
             if (this.count > this.options.maxNodes) {
                 return;
             }
             var node = new DocumentNode(id, label, level, linkTo);
             this.nodes[id] = node;
             if (!this.countPerLevel.hasOwnProperty(level)) {
                 this.countPerLevel[level] = 0;
             }
             this.countPerLevel[level] += 1;
             return node;
         }
     };

     /*
      * Bind the handler, so that its called with this attached to the
      * LinkGraph object. Call it with the callback as a parameter.
      * Additionally you may pass extra arguments which will be passed after
      * the original callback arguments.
      */
     LinkGraph.prototype.handler = function() {
         var self = this;
         var callback = arguments[0];
         var args = arguments;

         function handler() {
             callback.apply(self,
                            Array.concat(Array.slice(arguments),
                                         Array.slice(args).slice(1)));
         }

         return handler;
     };

     LinkGraph.prototype.gotDocument = function(err, resp, body) {

         if (doc == "Object Not Found") {
             render("error", this.target.attr('id'),
                    {text: "Document not found"});
             return;
         };

         var doc = JSON.parse(body);
         this.addNode(this.docID, doc['.type'], 0);
         var r;
         r = $.request({uri: config.baseURL + 'api/links/' + this.docID},
                       this.handler(this.gotLevel, 1));
         this.requests.push(r);

     };

     LinkGraph.prototype.isDone = function() {
         var done = true;

         $.each(this.requests, function() {
                    if (this.readyState != 4) {
                        done = false;
                    }
                });
         if (done){
             this.requests = [];             
         }
         return done;
     };

     LinkGraph.prototype.draw = function() {
         if (!this.isDone()) return;
         if (this.sigma) return;
         
         this.sigma = sigma.init(this.target[0]);

         this.sigma.graphProperties({minNodeSize: 1,
                                     maxNodeSize: 5});
         this.sigma.drawingProperties({defaultLabelColor: '#ccc',
                                       font: 'Arial',
                                       edgeColor: 'source',
                                       defaultEdgeType: 'line'
                                      });

         var self = this;
         var indexPerLevel = {};
         var availableColors = Array.slice(this.options.availableColors);
         var colorsForType = {};

         function positionNode(index, node) {
             if (! indexPerLevel.hasOwnProperty(node.level)) {
                 indexPerLevel[node.level] = -1;
             }
             indexPerLevel[node.level] += 1;
             var index = indexPerLevel[node.level];
             var count = self.countPerLevel[node.level];
             var angle = Math.PI * 2 * index / count;
             var x = 0.4 * node.level * Math.sin(angle);
             var y = 0.4 * node.level * Math.cos(angle);

             if (! colorsForType.hasOwnProperty(node.label)) {
                 colorsForType[node.label] = availableColors.shift();
                 availableColors.push(colorsForType[node.label]);
             }
             var opts = {x: x , y: y, label: node.label,
                         color: colorsForType[node.label],
                         size: self.options['limit'] - node.level + 2
                        };
             self.sigma.addNode(node.id, opts);
         }

         $.each(this.nodes, positionNode);

         function addEdges(index, node) {
             $.each(node.linkTo, function() {
                        var edgeID = node.id + '-' + this;
                        self.sigma.addEdge(edgeID, node.id, this);
                    });
         }
         
         $.each(this.nodes, addEdges);
         this.sigma.draw();
         this.sigma.startForceAtlas2();
         this.sigma.bind('downnodes', this.handler(this.sigmaDownNodes));
         setTimeout(function() {self.sigma.stopForceAtlas2()},
                    self.options.forceAtlasTimeout);

     };

     LinkGraph.prototype.sigmaDownNodes = function(event) {
         var docID = event.content[0];
         console.log(docID);
         if (docID != this.docID) {
             document.location.hash = "#graph/" + docID;
         }
     };

     LinkGraph.prototype.gotLevel = function(err, resp, body, level) {
         if (err) {
             console.log('Error getting level', err);
             return;
         }

         var self = this;
         var resp = JSON.parse(body);
         var added = [];
         $.each(resp.rows, function() {
                    var target, linkTo;
                    if (this.value && this.value['_id']) {
                        target = this.value['_id'];
                        linkTo = this.id;
                    } else {
                        target = this.id;
                        linkTo = this.key[0];
                    }
                    var isNew = self.addNode(target, this.key[1], level, linkTo);
                    if (isNew) added.push(isNew);
                });

         if (level < this.options.limit) {
             $.each(added, function() {
                        var r;
                        r = $.request(
                            {uri: config.baseURL + 'api/links/' + this.id},
                            self.handler(self.gotLevel, level + 1));
                        self.requests.push(r);
                        });
             
         } else {
             self.draw();
         }
     };

})(jQuery);
    

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


var browser = {};
browser.index = function () {
    browser.selectSection();
    document.title = "FEAT database inspection tool";

    render('welcome', 'main-container');
};


browser.graph = function() {
    browser.selectSection('graph');
    document.title = "Document link browser";

    var docID = this.params['docID'];
    render('graph', 'main-container', {docID: docID});
    if (docID) {
        new LinkGraph({target: $('#link-graph'), docID: docID});
    }
};


browser.selectSection = function(selected) {
    $('#top_menu li').removeClass('selected');
    if (selected) {
        $('#' + selected + '-link').closest('li').addClass('selected');
    }
}

$(function () {
  browser.s = $.sammy(function () {
    // Index of all databases
    this.get('', browser.index);
    this.get("#/", browser.index);
    this.get("#graph", browser.graph);
    this.post("#graph", function() {
        // this is used by jump to form
        this.redirect('#graph', this.params['docID']);
    });
    this.get("#graph/:docID", browser.graph);
  })
  browser.s.run();
});
