import React, { useEffect, useRef, useState } from 'react';
import { withRouter, RouteComponentProps } from 'react-router-dom';
import {
  Connection,
  CALLEE_MSG_ACCEPT,
  CALLER_MSG_INITIATE,
} from './Connection';
import SimplePeer from 'simple-peer';

import { PeerInfo } from './PeerInfo';

type FixLater = any;

const Video = (props: { peer: SimplePeer.Instance | null }) => {
  const ref = useRef<FixLater>();

  useEffect(() => {
    if (props.peer) {
      props.peer.on('stream', (stream: MediaStream) => {
        console.log('peer stream:', stream);
        if (ref.current) {
          ref.current.srcObject = stream;
        }
      });
    }
  }, []);

  return (
    <div>
      <video playsInline autoPlay ref={ref}></video>
    </div>
  );
};
interface Props extends RouteComponentProps<{ id: string }> {
  connection: Connection;
}
interface UserInRoom {
  [key: string]: PeerInfo;
}
// reference:
// https://ui.dev/react-router-v4-programmatically-navigate/
export const Room = withRouter(({ ...props }: Props) => {
  const userVideoRef = useRef<any>();
  const roomID = props.match.params.id;
  const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2,
  };
  console.log('roomID-->', roomID, 'props -->', props);
  const connection = props.connection;

  // ==============
  const userInRoomRef = useRef<UserInRoom>({});
  const [userInRoomState, setUserInRoomState] = useState({});

  useEffect(() => {
    if (connection === undefined) {
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: false })
      .then(gotMedia);
  }, []);

  const gotMedia = async (stream: MediaStream) => {
    if (userVideoRef === undefined || userVideoRef.current === undefined) {
      return;
    }
    userVideoRef.current.srcObject = stream;

    const roomInfo = await connection.joinRoom(roomID);

    if (roomInfo === null) {
      alert('This room does not exist.');
      props.history.push(`/`);
    }

    //0. initialize list of user in room
    for (const userID in roomInfo.user) {
      if (userID !== connection.userID()) {
        userInRoomRef.current[userID] = new PeerInfo(userID);
      }
    }
    //1. register listener to incoming request to connect
    connection.onCallerMsg(
      roomID,
      'request-connect',
      async (
        callerPayload: any[],
        callerMsgInd: number,
        callerMsgCnt: number,
        from: string
      ) => {
        while (callerMsgInd < callerMsgCnt) {
          const msg = callerPayload[callerMsgInd++];

          if (userInRoomRef.current[from] === undefined) {
            userInRoomRef.current[from] = new PeerInfo(from);
          }

          const currentPeerInfo = userInRoomRef.current[from];

          if (msg === CALLER_MSG_INITIATE) {
            await connection.sendCallerAResponse(CALLEE_MSG_ACCEPT, from);
          }
          currentPeerInfo.processCallerPayload(
            stream,
            from,
            msg,
            (signal) => {
              //TODO: compress signal data here
              connection.sendCallerAResponse(signal, from);
            },
            (event) => {
              //Update View when PeerToPeer Connection state cahges
              setUserInRoomState({});
            }
          );
        }
        setUserInRoomState({});
      }
    );
    //2. register listener to incoming responses from callee
    connection.onCalleeMsg(
      roomID,
      'response-signal',
      async (
        calleePayload: any[],
        calleeMsgInd: number,
        calleeMsgCnt: number,
        to: string
      ) => {
        while (calleeMsgInd < calleeMsgCnt) {
          const msg = calleePayload[calleeMsgInd++];

          if (userInRoomRef.current[to] === undefined) {
            userInRoomRef.current[to] = new PeerInfo(to);
          }
          const currentPeerInfo = userInRoomRef.current[to];

          currentPeerInfo.processCalleePayload(
            stream,
            to,
            msg,
            (signal) => {
              connection.sendCalleeAResponse(signal, to);
            },
            (event) => {
              //Update View when PeerToPeer Connection state cahges
              setUserInRoomState({});
            }
          );
        }
        setUserInRoomState({});
      }
    );
    //3. call existing peers in room
    callPeerInRoom(stream, roomInfo);

    setUserInRoomState({});
  };
  const callPeerInRoom = (stream: MediaStream, roomInfo: { user: any }) => {
    //3. call each user in the roo
    console.log({ roomInfo });
    const userInRoom = roomInfo.user;
    const currentUserID = connection.userID();
    const joinedTimestamp = connection.firebaseTimeToTimestamp(
      userInRoom[currentUserID]
    );
    console.log('current user joined room timestamp:', joinedTimestamp);

    for (const peerID in userInRoom) {
      const timestamp = connection.firebaseTimeToTimestamp(userInRoom[peerID]);

      // call users that were on before current user
      if (peerID !== currentUserID && timestamp < joinedTimestamp) {
        callPeer(peerID, stream, roomID);
      }
    }
  };
  const callPeer = (peerID: string, stream: any, roomID: string) => {
    connection.initiateConnection(roomID, 'initiate-connection', peerID);
  };
  const peerList = [];
  for (const peerid in userInRoomRef.current) {
    if (userInRoomRef.current[peerid].peer) {
      peerList.push(userInRoomRef.current[peerid].peer);
    }
  }
  const stateToColor = {
    failed: 'red',
    initiated: 'orange',
    'not-connected': 'grey',
    connecting: 'yellow',
    connected: 'green',
  };

  const stat = !userInRoomRef.current
    ? null
    : Object.keys(userInRoomRef.current).map((key) => {
        return (
          <li key={key}>
            User ID: {key} Status:{' '}
            <span
              style={{
                backgroundColor: stateToColor[userInRoomRef.current[key].state],
              }}
            >
              {userInRoomRef.current[key].state}
            </span>
          </li>
        );
      });
  console.log('peer list:', peerList);
  console.log(userInRoomRef.current);
  return (
    <div>
      <h3>My User ID: {connection ? connection.userID() : undefined}</h3>
      <video muted ref={userVideoRef} autoPlay playsInline></video>
      <h3>User In Room:</h3>
      <ul>{stat}</ul>
      <hr></hr>
      {peerList.map((peer, index) => {
        return (
          <div key={index}>
            {index}
            <Video peer={peer}></Video>
          </div>
        );
      })}
    </div>
  );
});
