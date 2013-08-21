/*
 * Bind the handler, so that its called with this attached to the
 * owning object. Call it with the callback as a parameter.
 * Additionally you may pass extra arguments which will be passed after
 * the original callback arguments.
 */
function handlerFactory() {
    var self = this;
    var callback = arguments[0];
    var args = arguments;

    function handler() {
        callback.apply(self,
                       Array.prototype.concat(
                           Array.prototype.slice.call(arguments),
                           Array.prototype.slice.call(args, 1)));
    }

    return handler;
};


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
             return null;
         } else {
             this.count += 1;
             if (this.count > this.options.maxNodes) {
                 return null;
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

     LinkGraph.prototype.handler = handlerFactory;

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
                                     maxNodeSize: 10});
         this.sigma.drawingProperties({defaultLabelColor: '#ccc',
                                       font: 'Arial',
                                       edgeColor: 'source',
                                       defaultEdgeType: 'line'
                                      });

         var self = this;
         var indexPerLevel = {};
         var availableColors = Array.prototype.slice.call(
             this.options.availableColors);
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
                         size: 3 * (self.options['limit'] - node.level) + 2
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
         setTimeout(function() {self.sigma.stopForceAtlas2();},
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

         }
         self.draw();
     };

})(jQuery);


(function($) {

     PaginationControls = function() {
         this.currentPage = 0;
         this.totalPages = null;
         this.totalRecords = null;
         this.perPage = 10;
     };

     PaginationControls.prototype.getQuery = function() {
         return "limit=" + this.perPage + "&skip=" + (this.currentPage * this.perPage);
     };

     var defaults = {
         target: null,
         type: null
     };

     window.TypesTable = function(opts) {
         this.options = $.extend({}, defaults, opts);
         this.headers = null;
         this.paginator = new PaginationControls();
         $.request({uri: (config.baseURL + 'api/types/' +
                          this.options.type + '/headers?' +
                          this.paginator.getQuery())},
                   this.handler(this.gotHeaders));
     };

     TypesTable.prototype.handler = handlerFactory;

     TypesTable.prototype.gotHeaders = function(err, res, body) {
         if (err) {
             console.log(err);
             return;
         }
         this.headers = JSON.parse(body);
         this.headers.sort();
         this.headers = Array.prototype.concat.call(['_id'], this.headers);
         this.getRows();
     };

     TypesTable.prototype.getRows = function() {
         $.request({uri: (config.baseURL + 'api/types/' +
                          this.options.type + '?' +
                          this.paginator.getQuery())},
                   this.handler(this.gotRows));
     };

     TypesTable.prototype.gotRows = function(err, res, body) {
         if (err) {
             console.log(err);
             return;
         }
         var resp = JSON.parse(body);
         this.rows = [];
         for (var row in resp.rows) {
             var current = []
             this.rows.push(current);
             for (var header in this.headers){
                 var value = resp.rows[row].doc[this.headers[header]];
                 current.push(value);
             }
         }
         this.render();
     };

     TypesTable.prototype.render = function() {
         var targetID = this.options.target.attr('id');
         render('table', targetID, this);
         for (var index in this.rows) {
             var tr = $('<tr></tr>');
             var td = $('<td></td>');
             for (var cindex in this.rows[index]) {
                 var td = $("<td></td>");
                 if (cindex == 0) {
                     var docID = this.rows[index][cindex];
                     var value = $('<a></a>'
                                  ).attr('href', config.futonURL(docID)
                                  ).attr('target', 'blank'
                                  ).html(this.rows[index][cindex]);
                 } else{
                     var value = _renderValue(this.rows[index][cindex]);
                 }
                 td.append(value).appendTo(tr);
             }
             tr.appendTo(this.options.target.find('tbody'));
         }
         this.options.target.css('max-height',
                                 window.innerHeight - this.options.target.offset().top);
     };

     TypesTable.prototype.cleanup = function() {
         this.options.target.html('');
     };
     

     function _renderValue(value) {
        function isNullOrEmpty(val) {
          if (val == null) return true;
          for (var i in val) return false;
          return true;
        }
        function render(val) {
          var type = typeof(val);
          if (type == "object" && !isNullOrEmpty(val)) {
            var list = $("<dl></dl>");
            for (var i in val) {
              $("<dt></dt>").text(i).appendTo(list);
              $("<dd></dd>").append(render(val[i])).appendTo(list);
            }
            return list;
          } else {
            var html = $.futon.formatJSON(val, {
              html: true,
              escapeStrings: false
            });
            var n = $(html);
            if (n.text().length > 140) {
              // This code reduces a long string in to a summarized string with a link to expand it.
              // Someone, somewhere, is doing something nasty with the event after it leaves these handlers.
              // At this time I can't track down the offender, it might actually be a jQuery propogation issue.
              var fulltext = n.text();
              var mintext = n.text().slice(0, 140);
              var e = $('<a href="#expand">...</a>');
              var m = $('<a href="#min">X</a>');
              var expand = function (evt) {
                n.empty();
                n.text(fulltext);
                n.append(m);
                evt.stopPropagation();
                evt.stopImmediatePropagation();
                evt.preventDefault();
              };
              var minimize = function (evt) {
                n.empty();
                n.text(mintext);
                // For some reason the old element's handler won't fire after removed and added again.
                e = $('<a href="#expand">...</a>');
                e.click(expand);
                n.append(e);
                evt.stopPropagation();
                evt.stopImmediatePropagation();
                evt.preventDefault();
              };
              e.click(expand);
              n.click(minimize);
              n.text(mintext);
              n.append(e);
            }
            return n;
          }
        }
        var elem = render(value);

        elem.find("dd:has(dl)").hide().prev("dt").addClass("collapsed");
        elem.find("dd:not(:has(dl))").addClass("inline").prev().addClass("inline");
        elem.find("dt.collapsed").click(function() {
          $(this).toggleClass("collapsed").next().toggle();
        });

        return elem;
      }

     
})(jQuery);


function render(template, target, data) {
    if ( !data ) var data = {};
    var html = $.mustache($("#" + template + "-template").text(), data);
    $( "#" + target ).html(html);
}

var config = {
    db: document.location.href.split( '/' )[ 3 ],
    design: 'browser'
};

config.baseURL = "/" + config.db + "/_design/" + config.design + "/_rewrite/";

config.futonURL = function(docID) {
    return '/_utils/document.html?' + this.db + '/' + docID;
};


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


browser.types = function () {
    browser.selectSection('types');
    document.title = "Document types browser";

    var type = this.params['type'];
    render('types', 'main-container', {type: type});

    function gotTypes(err, resp, body) {
        if (err) {
            console.log(err);
            return;
        }
        var types = JSON.parse(body);
        var options = [];
        $.each(types, function() {options.push({label: this, value: this});});
        render('type-select', 'type-select-container', {'options': options});
        if (type) $('#type-select').val(type);
        $('#type-select').chosen();
        $('#type-select').bind('change', function(ev) {
                                   $(ev.target).closest('form').submit();});
    }

    $.request({uri: config.baseURL + 'api/types'}, gotTypes);

    if (type) {
        if (! browser.types.table) {
            browser.types.table = new TypesTable(
                {type: type, target: $("#table-container")});
        }
    }
}


browser.selectSection = function(selected) {
    $('#top_menu li').removeClass('selected');
    if (selected) {
        $('#' + selected + '-link').closest('li').addClass('selected');
    }
}

$(function () {
      browser.s = $.sammy(
          function () {
              // Index of all databases
              this.get('', browser.index);
              this.get("#/", browser.index);
              this.get("#graph", browser.graph);
              this.post("#graph", function() {
                            this.redirect('#graph', this.params['docID']);
                        });
              this.get("#graph/:docID", browser.graph);
              this.get("#types", browser.types);
              this.post("#types", function() {
                            if (browser.types.table) {
                                browser.types.table.cleanup();
                                delete browser.types.table;
                            }
                            this.redirect('#types', this.params['type']);
                        });
              this.get("#types/:type", browser.types);
          });
      browser.s.run();
});
