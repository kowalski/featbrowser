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

ddoc.views = {
    'documentStats': {
        'map': function(doc) {
            var value = {};
            value.documentSize = JSON.stringify(doc).length;
            value.count = 1;
            value.attachmentsSize = 0;
            value.attachmentsCount = 0;
            if (doc._attachments) {
                for (var name in doc._attachments) {
                    value.attachmentsCount += 1;
                    value.attachmentsSize += doc._attachments[name].length;
                }
            }
            value.totalSize = value.documentSize + value.attachmentsSize;
            emit(doc['.type'], value);
        },
        'reduce': function(keys, values, rereduce) {
            var result = {};
            var names = ['documentSize', 'count', 'attachmentsSize',
                         'attachmentsCount', 'totalSize'];
            for (var index = 0; index < values.length; index++) {
                var value = values[index];
                for (var index2 = 0; index2 < names.length; index2++) {
                    var name = names[index2];
                    if (!result[name]) result[name] = 0;
                    result[name] += value[name];
                }
            }
            return result;
        }
    }
};

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