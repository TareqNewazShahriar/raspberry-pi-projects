const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
//const { getAnalytics } = require('firebase-admin/analytics');
const { onSnapshot, collection, getDoc, getDocs, addDoc, setDoc, updateDoc, doc, query, where, WhereFilterOp } = require('firebase-admin/firestore');
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

   console.log({Timestamp, FieldValue})
}
catch (error) {
   console.log('Error occurred while initializing the database.');
}

function getCollection(collectionName, field, operator, val) {
   return new Promise((resolve, reject) => {
      const collectionRef = db.collection(collectionName);
      if(field && operator && val)
      collectionRef.where(field, operator, val)
         .get()
         .then(result => {
            if (result.empty) {
               resolve([]);
            }
            else {
               let list = [];
               result.forEach(doc => {
                  list.push(doc.data());
                  list.id = doc.id;
                  console.log(doc);
               });
            }
         })
         .catch(err => {
            reject({message: `Error occurred while getting data. Document name: ${collectionName} [${err.message}]`, error: err.toJsonString()});
         });;
   });
}

function getCollectionWithListener(collectionName, field, operator, val, onChange) {
   let q = query(collection(_db, collectionName), where(field, operator, val));
   const unsubscribe = onSnapshot(q,
      querySnapshot => {
         const list = [];
         querySnapshot.docChanges().forEach((res) => {
            const data = res.doc.data();
            data.id = res.doc.id;
            list.push({ state: res.type, doc: data });
         });
         onChange({ success: true, data: list, pending: querySnapshot.metadata.hasPendingWrites});
      },
      err => {
         onChange({ success: false, errorMessage: `Error occurred on ${collectionName} listener. [${err.message}]`});
      }
   );

   return unsubscribe;
}

function getById(collectionName, docId) {
   return new Promise((resolve, reject) => {
      const docRef = db.collection(collectionName).doc(docId);
      docRef.get()
         .then(docSpapshot => {
            let data = null;
            if(docSpapshot.exists) {
               data = docSpapshot.data();
               data.id = docSpapshot.id;
            }
            resolve(data);
         })
         .catch(err => {
            reject({message: `Error occurred while getting data. Document name: ${collectionName}, doc-id: ${docId}. [${err.message}]`, error: err.toJsonString()});
         });
   });
}

function addNewDoc(collectionName, data) {
   return new Promise((resolve, reject) => {
      db.collection(collectionName)
         .add(data)
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
      const docRef = db.collection(collectionName).doc(docId);
      docRef.update(data)
         .then(() => resolve())
         .catch(error => reject({ message: `Error on updating a record in ${collectionName}, ID: ${docId}.`, error: error }));
   });
}

const firestoreService = {
   getCollection,
   getCollectionWithListener,
   getById,
   addNewDoc,
   update
};

module.exports = { firestoreService, DB };
