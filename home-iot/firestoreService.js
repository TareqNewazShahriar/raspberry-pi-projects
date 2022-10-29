const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAnalytics } = require('firebase-admin/analytics');
const { onSnapshot, getFirestore, collection, getDoc, getDocs, addDoc, setDoc, updateDoc, doc, query, where, WhereFilterOp } = require('firebase/firestore');
const serviceAccountConfig = require('./whats-up-home-iot-ea85a9d1886e.json');

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
   _analytics = getAnalytics(_app);

   console.log({_analytics})
}
catch (error) {
   console.log('Error occurred while initializing the database.');
}

function getAll(collectionName, field, operator, val) {
   return new Promise((resolve, reject) => {
      let q;
      if(field && operator && val)
         q = query(collection(_db, collectionName), where(field, operator, val));
      else
         q = collection(getFirestore(_app), collectionName);

      getDocs(q)
         .then(queryResult => {
            const list = queryResult.docs.map(doc => {
               const data = doc.data();
               data.id = doc.id;
               return data;
            });
            resolve(list || []);
         })
         .catch(err => {
            reject(err);
         });
   });
}

function getCollectionWithListener(collectionName, field, operator, val, onChange) {
   let q = query(collection(getFirestore(_app), collectionName), where(field, operator, val));
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

function getSingle(collectionName, docId) {
   return new Promise((resolve, reject) => {
      const docRef = doc(getFirestore(_app), collectionName, docId);
      getDoc(docRef)
         .then(docSpapshot => {
            let data = null;
            if(docSpapshot.exists()) {
               data = docSpapshot.data();
               data.id = docSpapshot.id;
            }
            resolve(data);
         })
         .catch(err => {
            reject(`Error occurred while getting data. Document name: ${collectionName} [${err.message}]`);
         });
   });
}

function addNewDoc(collectionName, data, footprint) {
   return new Promise((resolve, reject) => {
      addDoc(collection(_db, collectionName), data)
         .then(docRef => resolve(docRef.id))
         .catch(err => reject(err));
   });
}

function writeNewDoc_lazy(collectionName, data) {
   return new Promise(async(resolve, reject) => {
      try {
         const db = getFirestore(_app);
         // Add a new document with a generated id
         const newCityRef = doc(collection(db, collectionName));

         // ...

         // AND on a later point, set data to the previously created blank document
         await setDoc(newCityRef, data);
         resolve(newCityRef.id);
      }
      catch (error) {
         reject(error);
      }
   });
}

function update(collectionName, docId, data, footprint) {
   return new Promise(async(resolve, reject) => {
      if(footprint)
         addFootprint(data, false);

      const db = getFirestore(_app);
      const dbDocRef = doc(db, collectionName, docId);
      updateDoc(dbDocRef, data)
         .then(() => resolve(null))
         .catch(error => reject({ msg: `Error on updating a record in ${collectionName}, ID: ${docId}.`, error: error }));
   });
}

const firestoreService = {
   getAll,
   getCollectionWithListener,
   getSingle,
   addNewDoc,
   update
};

export { firestoreService, DB };
