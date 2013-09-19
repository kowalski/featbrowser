 var couchapp = require('couchapp')
  , path = require('path')
  ;

ddoc =
  { _id:'_design/browser'
  , rewrites :
    [ {from:"/", to:'index.html'}
    , {from:"/api", to:'../../'}
    , {from:"/api/links/:doc_id", to:'../../_design/featjs/_view/join',
       query: {startkey: [":doc_id"], endkey: [":doc_id", {}]}}
    , {from:"/api/types/:type/headers",
       to:"_list/headers/featjs/by_type",
       query: {startkey: [":type"], endkey: [":type", {}],
               include_docs: "true", reduce: "false"}}
    , {from:"/api/types/:type/count",
       to:"../../_design/featjs/_view/by_type",
       query: {startkey: [":type"], endkey: [":type", {}],
               group_level: "1"}}
    , {from:"/api/types/:type", to:"../../_design/featjs/_view/by_type",
       query: {startkey: [":type"], endkey: [":type", {}],
               include_docs: "true", reduce: "false"}}
    , {from:"/api/types", to:"_list/keys/featjs/by_type",
       query: {group_level: "1"}}
    , {from:"/api/*", to:'../../*'}
    , {from:"/*", to:'*'}
    ]
  }
  ;

ddoc.views = {};

ddoc.lists = {

    headers: function(head, req) {
        var seen = [];
        var begun = false;

        start({"headers":{"Content-Type": "application/json"}});
        send("[");
        while (row = getRow()) {
            for (var key in row.doc) {
                if (seen.indexOf(key) == -1) {
                    seen.push(key);
                    if (key[0] != '.' && key[0] != '_') {
                        if (begun) send(", ");
                        begun = true;
                        send('"' + key + '"');
                    }
                }
            }
        }
        send("]");
    },

    keys: function(head, req) {
        var seen = [];
        var begun = false;
        var typeName;

        start({"headers":{"Content-Type": "application/json"}});
        send("[");
        while (row = getRow()) {
            typeName = row.key[0];
            if (seen.indexOf(typeName) == -1) {
                seen.push(typeName);
                if (begun) send(", ");
                begun = true;
                send('"' + typeName + '"');
            }
        }
        send("]");
    }

}

ddoc.validate_doc_update = function (newDoc, oldDoc, userCtx) {
  if (newDoc._deleted === true && userCtx.roles.indexOf('_admin') === -1) {
    throw "Only admin can delete documents on this database.";
  }
}

couchapp.loadAttachments(ddoc, path.join(__dirname, 'attachments'));

module.exports = ddoc;