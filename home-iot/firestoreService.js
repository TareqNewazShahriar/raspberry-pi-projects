const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const serviceAccountConfig = require('./secrets/firebase-service-account-key.json');

const DB = {
   Collections: { values: 'values', faces: 'faces', logs: 'logs' },
   Roles: { programmer: 'programmer', user: 'user' },
   state: { added:'added', modified:'modified', removed:'removed' }
};

let _app;
let _db;
let _analytics;

try {
   _app = initializeApp({ credential: cert(serviceAccountConfig) }); 
   _db = getFirestore();
   //_analytics = getAnalytics(_app);
}
catch (error) {
   console.log('Error occurred while initializing the database.');
}

function getCollection(collectionName, field, operator, val) {
   return new Promise((resolve, reject) => {
      const promise = field && operator && val ?
         _db.collection(collectionName).where(field, operator, val).get() :
         _db.collection(collectionName).get();

         promise.then(result => {
            if (result.empty) {
               resolve([]);
            }
            else {
               let collection = [];
               result.forEach(doc => {
                  collection.push(prepareTheDoc(doc));
               });
               resolve(collection);
            }
         })
         .catch(err => {
            reject({message: `Error occurred while getting data. Document name: ${collectionName} [${err.message}]`, error: err.toJsonString()});
         });;
   });
}

/*
   After binding listener, onChange will be fired
   immediately with state 'added' for all matching items.
   As of Oct 22, Node.js implementation of firesotre SDK doesn't have pendingWrite feature.
 */
function getCollectionWithListener(collectionName, field, operator, val, onChange) {
   const query = _db.collection(collectionName).where(field, operator, val);
   const unsubCallback = query.onSnapshot(querySnapshot => {
         const collection = [];
         querySnapshot.docChanges().forEach(res => {
            collection.push({ state: res.type, doc: prepareTheDoc(res.doc) });
         });
         onChange({ success: true, collection});
      },
      err => onChange({ success: false, errorMessage: `Error occurred on ${collectionName} listener. [${err.message}]`}));

      return unsubCallback;
}

function getById(collectionName, docId) {
   return new Promise((resolve, reject) => {
      _db.collection(collectionName).doc(docId)
         .get()
         .then(docSpapshot => {
            docSpapshot.exists ? resolve(prepareTheDoc(docSpapshot)) : resolve(data);
         })
         .catch(err => {
            reject({message: `Error occurred while getting data. Document name: ${collectionName}, doc-id: ${docId}. [${err.message}]`, error: err.toJsonString()});
         });
   });
}

/*
   After binding listen, onChange will be fired immediately.
   Single document binder doesn't have a stete (type) porperty.
   As of Oct 22, Node.js implementation of firesotre SDK doesn't have pendingWrite feature.
*/
function getByIdWithListener(collectionName, docId, onChange) {
   const doc = _db.collection(collectionName).doc(docId);

   const unsubCallback = doc.onSnapshot(docSnapshot => {
         const document = prepareTheDoc(docSnapshot);
         onChange({ success: true, doc: document});
      },
      err => onChange({ success: false, errorMessage: `Error occurred on ${collectionName}/${docId} listener. [${err.message}]`})
   );

   return unsubCallback;
}

function create(collectionName, data, docId) {
   return new Promise((resolve, reject) => {
      const docRef = docId ? _db.collection(collectionName).doc(docId) : _db.collection(collectionName).doc();
      docRef.set(data)
         .then(result => {
            resolve(result.id);
         })
         .catch(err => {
            reject({message: `Error occurred while adding data. Document name: ${collectionName}. [${err.message}]`, error: err.toJsonString()});
         });
   });
}

function update(collectionName, docId, data) {
   return new Promise(async(resolve, reject) => {
      _db.collection(collectionName).doc(docId)
         .update(data)
         .then(() => resolve())
         .catch(error => reject({ message: `Error on updating a record in ${collectionName}, ID: ${docId}.`, error: error }));
   });
}

function prepareTheDoc(doc) {
   let document = doc.data();
   document.id = doc.id;
   document._readTime = doc._readTime.toDate();
   document._createTime = doc._createTime.toDate();
   document._updateTime = doc._createTime._nanoseconds === doc._updateTime._nanoseconds ? null : doc._updateTime.toDate();

   //document.keys.forEach(k => document[k] instanceof Timestamp ? document[k] = document[k].toDate() : null);
   for (const key in document) {
      if (Object.hasOwnProperty.call(document, key) && document[key] instanceof Timestamp) {
         document[key] = document[key].toDate();
      }
   }


   return document;
}

const firestoreService = {
   getCollection,
   getCollectionWithListener,
   getById,
   getByIdWithListener,
   create,
   update
};

module.exports = { firestoreService, DB };

/*
timestamp fields with every doc:

  _readTime: Timestamp { _seconds: 1667069775, _nanoseconds: 928085000 },
  _createTime: Timestamp { _seconds: 1667036376, _nanoseconds: 570482000 },
  _updateTime: Timestamp { _seconds: 1667036376, _nanoseconds: 570482000 }
*/