import { firestore, auth, initializeApp } from 'firebase';

const firebase = { firestore, auth, initializeApp };

export const CALLER_MSG_INITIATE = 'initiate';
export const CALLEE_MSG_ACCEPT = 'callee-accept';

type NumberDict = {
  [key: number]: any;
};
type FirebaseTimeStamp = {
  seconds: any;
  nanoseconds: any;
};
type ConnectionInfo = {
  from: string;
  to: string;
  roomID: string;
  message: string;
  // =============
  callerMsgCnt: number;
  callerMsgInd: number;
  callerMsgDiff: number;
  callerPayload: NumberDict;
  // ==============
  calleeMsgCnt: number;
  calleeMsgInd: number;
  calleeMsgDiff: number;
  calleePayload: NumberDict;
  // ==============
  payloadByteUsed: number;
  lastUpdated: FirebaseTimeStamp;
};
export type Connection = {
  userID: () => string;
  onCallerMsg: (roomID: string, message: string, callback: Function) => void;
  onCalleeMsg: (roomID: string, message: string, callback: Function) => void;
  sendCallerAResponse: (data: any, from: string) => Promise<any>;
  sendCalleeAResponse: (data: any, to: string) => Promise<any>;
  initiateConnection: (
    roomID: string,
    message: string,
    to: string
  ) => Promise<any>;
  joinRoom: (roomID: string) => Promise<any>;
  createRoom: () => Promise<null | string>;
  firebaseTimeToTimestamp: (firebaseTimestamp: FirebaseTimeStamp) => number;
};
export const Connection = async () => {
  if (process.env.REACT_APP_PEER_FIREBASE === undefined) {
    throw 'Firebase API Key Not Defined';
  }

  const str = process.env.REACT_APP_PEER_FIREBASE.slice(1, -1);
  const firebaseConfig = JSON.parse(str);
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const userAuth = await firebase.auth().signInAnonymously();

  if (userAuth === null || userAuth.user === null) {
    return;
  }
  console.log('user auth uid:', userAuth.user.uid);
  let existingUserRef = await db
    .collection('user')
    .doc(userAuth.user.uid)
    .get();
  console.log('==== user existing info ====');
  console.log('user has existing info status:', existingUserRef.exists);
  console.log('user existing info id:', existingUserRef.id);
  console.log('user existing info:', existingUserRef.data());

  if (!(existingUserRef && existingUserRef.exists)) {
    await db.collection('user').doc(userAuth.user.uid).set({
      authenInfo: null,
      friendList: [],
      roomOwner: [],
      roomMemeber: [],
    });
  }
  const userRef = await db.collection('user').doc(userAuth.user.uid);
  console.log('userRef:', userRef);
  console.log('userRef id:', userRef.id);

  const firebaseTimeToTimestamp = (firebaseTimestamp: FirebaseTimeStamp) => {
    const { seconds, nanoseconds } = firebaseTimestamp;

    const timestamp = new firebase.firestore.Timestamp(
      seconds,
      nanoseconds
    ).toMillis();

    return timestamp;
  };
  const processCallerData = async (docID: string) => {
    const docRef = await db.doc(`connection/${docID}`);
    return await db.runTransaction(async (transaction) => {
      let doc = await transaction.get(docRef);
      if (doc.exists) {
        const connectionInfo = doc.data() as ConnectionInfo;

        const { callerPayload, from, lastUpdated } = connectionInfo;
        let { callerMsgInd, callerMsgCnt } = connectionInfo;

        const currentTime = firebase.firestore.Timestamp.now().toMillis();
        const lastUpdateMili = firebaseTimeToTimestamp(lastUpdated);
        const expired = currentTime - lastUpdateMili >= 30000;

        console.log('incoming caller msg:', {
          callerPayload,
          callerMsgInd,
          callerMsgCnt,
          from,
          lastUpdateMili,
          currentTime,
          expired,
        });

        if (callerMsgInd >= callerMsgCnt || expired) {
          console.log('no caller msg to process');
          return null;
        }

        const copyPayload = Object.assign({}, callerPayload);
        const copyMsgInd = callerMsgInd;

        //process incoming data
        while (callerMsgInd < callerMsgCnt)
          delete callerPayload[callerMsgInd++];
        console.log('updating remote copy:', { callerPayload, callerMsgInd });

        await transaction.update(docRef, {
          callerPayload,
          callerMsgInd,
          callerMsgDiff: callerMsgCnt - callerMsgInd,
          lastUpdated: firebase.firestore.Timestamp.now().toDate(),
        });

        return {
          callerPayload: copyPayload,
          callerMsgInd: copyMsgInd,
          callerMsgCnt,
          from,
        };
      }
      return null;
    });
  };
  const processCalleeData = async (docID: string) => {
    const docRef = await db.doc(`connection/${docID}`);
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (doc.exists) {
        const connectionInfo = doc.data() as ConnectionInfo;
        let {
          calleePayload,
          to,
          lastUpdated,
          calleeMsgInd,
          calleeMsgCnt,
        } = connectionInfo;

        const currentTime = firebase.firestore.Timestamp.now().toMillis();
        const lastUpdateMili = firebaseTimeToTimestamp(lastUpdated);
        const expired = currentTime - lastUpdateMili >= 30000;

        console.log('incoming callee msg:', {
          calleePayload,
          calleeMsgInd,
          calleeMsgCnt,
          to,
          lastUpdateMili,
          currentTime,
          expired,
        });

        if (calleeMsgInd >= calleeMsgCnt || expired) {
          console.log('no callee msg to process');
          return null;
        }

        const copyPayload = Object.assign({}, calleePayload);
        const copyMsgInd = calleeMsgInd;

        //process incoming data
        while (calleeMsgInd < calleeMsgCnt)
          delete calleePayload[calleeMsgInd++];
        console.log('updating remote copy:', { calleePayload, calleeMsgInd });

        await transaction.update(docRef, {
          calleePayload,
          calleeMsgInd,
          calleeMsgDiff: calleeMsgCnt - calleeMsgInd,
          lastUpdated: firebase.firestore.Timestamp.now().toDate(),
        });

        return {
          calleePayload: copyPayload,
          calleeMsgInd: copyMsgInd,
          calleeMsgCnt,
          to,
        };
      }
      return null;
    });
  };

  const connectionInterface: Connection = {
    userID: function () {
      return userRef.id;
    },
    onCallerMsg: function (
      roomID: string,
      message: string,
      callback: Function
    ) {
      db.collection('connection')
        .where('roomID', '==', roomID)
        .where('to', '==', userRef.id)
        .where('callerMsgDiff', '>', 0)
        .onSnapshot((snapshot) => {
          snapshot.forEach(async (doc) => {
            if (doc.exists) {
              const data = await processCallerData(doc.id);

              if (data) {
                const {
                  callerPayload,
                  callerMsgInd,
                  callerMsgCnt,
                  from,
                } = data;
                console.log('processing payload:', {
                  callerPayload,
                  callerMsgInd,
                  callerMsgCnt,
                });
                await callback(callerPayload, callerMsgInd, callerMsgCnt, from);
              }
            }
          });
        });
    },
    onCalleeMsg: function (
      roomID: string,
      message: string,
      callback: Function
    ) {
      db.collection('connection')
        .where('roomID', '==', roomID)
        .where('from', '==', userRef.id)
        .where('calleeMsgDiff', '>', 0)
        .onSnapshot((snapshot) => {
          snapshot.forEach(async (doc) => {
            if (doc.exists) {
              const data = await processCalleeData(doc.id);

              if (data) {
                const { calleePayload, calleeMsgInd, calleeMsgCnt, to } = data;

                await callback(calleePayload, calleeMsgInd, calleeMsgCnt, to);
              }
            }
          });
        });
    },
    sendCallerAResponse: async function (data: any, from: string) {
      const connectionID = [from, userRef.id].sort().join('_');
      console.log('responding to caller:', from);
      console.log('connection id:', connectionID);
      console.log({ data });

      const docRef = await db.doc(`connection/${connectionID}`);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (doc.exists) {
          const connectionInfo = doc.data() as ConnectionInfo;
          let { calleePayload, calleeMsgCnt, calleeMsgInd } = connectionInfo;

          // get byte count of payload/data
          const increment = firebase.firestore.FieldValue.increment(
            new TextEncoder().encode(JSON.stringify(data)).length
          );

          calleePayload[calleeMsgCnt] = data;
          calleeMsgCnt++;

          await transaction.update(docRef, {
            calleeMsgCnt,
            calleePayload,
            calleeMsgDiff: calleeMsgCnt - calleeMsgInd,
            lastUpdated: firebase.firestore.Timestamp.now().toDate(),
            payloadByteUsed: increment,
          });
        }
      });
    },
    sendCalleeAResponse: async function (data: any, to: string) {
      const connectionID = [to, userRef.id].sort().join('_');
      console.log('responding to callee:', to);
      console.log('connection id:', connectionID);
      console.log({ data });

      const docRef = await db.doc(`connection/${connectionID}`);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (doc.exists) {
          const connectionInfo = doc.data() as ConnectionInfo;
          let { callerPayload, callerMsgCnt, callerMsgInd } = connectionInfo;

          // get byte count of payload/data
          const increment = firebase.firestore.FieldValue.increment(
            new TextEncoder().encode(JSON.stringify(data)).length
          );

          callerPayload[callerMsgCnt] = data;
          callerMsgCnt++;

          await transaction.update(docRef, {
            callerMsgCnt,
            callerPayload,
            callerMsgDiff: callerMsgCnt - callerMsgInd,
            lastUpdated: firebase.firestore.Timestamp.now().toDate(),
            payloadByteUsed: increment,
          });
        }
      });
    },
    initiateConnection: async function (
      roomID: string,
      message: string,
      to: string
    ) {
      try {
        const connectionID = [to, userRef.id].sort().join('_');
        console.log('initiating connnection from:', userRef.id);
        console.log('connection id:', connectionID);
        console.log({ roomID, message, to, from: userRef.id });

        // check if other caller is in control
        const connectionRef = await db.doc(`connection/${connectionID}`);

        await db.runTransaction(async (transaction) => {
          const priorConnectionDoc = await transaction.get(connectionRef);

          const priorConData =
            priorConnectionDoc.exists === true
              ? priorConnectionDoc.data()
              : null;
          let priorConExpired = false;

          if (priorConData) {
            const controlLastUpdated = this.firebaseTimeToTimestamp(
              priorConData.lastUpdated
            );
            const currentTime = firebase.firestore.Timestamp.now().toMillis();
            priorConExpired = currentTime - controlLastUpdated >= 30000; //expired after 30 seconds

            console.log(
              'prior control expire status:',
              priorConExpired,
              ', milisecond elapsed:',
              currentTime - controlLastUpdated
            );
          }

          if (priorConData === null || priorConExpired) {
            // initiate connection
            console.log('creating new connection');
            await transaction.set(connectionRef, {
              from: userRef.id,
              to,
              roomID,
              message,
              // =============
              callerMsgCnt: 1,
              callerMsgInd: 0,
              callerMsgDiff: 1,
              callerPayload: { 0: CALLER_MSG_INITIATE },
              // ==============
              calleeMsgCnt: 0,
              calleeMsgInd: 0,
              calleeMsgDiff: 0,
              calleePayload: {},
              // ==============
              payloadByteUsed: 0,
              lastUpdated: firebase.firestore.Timestamp.now().toDate(),
            });
          }
        });
      } catch (e) {
        console.error('msg send error:', e);
      }
    },
    joinRoom: async function (roomID: string) {
      try {
        console.log('joining room:', roomID);
        if (roomID) {
          const docRef = await db.doc(`room/${roomID}`);
          const doc = await docRef.get();

          if (doc && doc.exists) {
            console.log('userRef in room:', userRef.id);
            const user = {
              ['user.' +
              userRef.id]: firebase.firestore.Timestamp.now().toDate(),
            };
            console.log('room data:', doc.data());
            console.log('msg queue data:', user);
            await docRef.update(user);
            const updatedDoc = await docRef.get();
            return updatedDoc.data();
          } else {
            console.log("room doesn't exist:", roomID);
          }
        }
      } catch (e) {
        console.error('join room exception:', e);
      }
      return null;
    },
    createRoom: async function () {
      try {
        const docRef = await db.collection('room').add({
          user: {},
          created: firebase.firestore.Timestamp.now().toDate(),
        });
        const res = await userRef.update({
          roomOwner: firebase.firestore.FieldValue.arrayUnion(docRef.id),
        });
        console.log('create room id:', docRef.id);
        console.log('create room info:', res);
        return docRef.id;
      } catch (e) {
        console.error('create room exception:', e);
      }
      return null;
    },
    firebaseTimeToTimestamp: firebaseTimeToTimestamp,
  };

  return connectionInterface;
};
