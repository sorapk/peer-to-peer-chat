import React, { useEffect, useRef, useState } from 'react';
import { withRouter, RouteComponentProps } from 'react-router-dom';
import {
  Connection,
  CALLEE_MSG_ACCEPT,
  CALLER_MSG_INITIATE,
} from './Connection';
import SimplePeer from 'simple-peer';
import { PeerInfo } from './PeerInfo';
import './Room.css';
import styled from 'styled-components';

type FixLater = any;

const Video = (props: {
  peer: SimplePeer.Instance | null;
  className: string;
}) => {
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
      <video playsInline autoPlay ref={ref} className={props.className}></video>
    </div>
  );
};

// === ICONS ========

interface ControlProps {
  muteAudio: boolean;
  muteVideo: boolean;
  hangup: boolean;
  showMessage: boolean;
  switchCam: boolean;
}
interface ControlAction {
  clickMuteAudio: () => void;
  clickMuteVideo: () => void;
  clickHangup: () => void;
  clickShowMessage: () => void;
  clickSwitchCam: () => void;
}
const Control = (props: ControlProps & ControlAction) => {
  const [active, setActive] = useState(false);
  const timeoutHandleRef = useRef<number | null>();

  const timeoutCleanup = () => {
    if (timeoutHandleRef.current !== null) {
      clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
  };
  const mouseEnter = () => {
    timeoutCleanup();
    setActive(true);
  };
  const mouseLeave = () => {
    timeoutHandleRef.current = setTimeout(() => {
      setActive(false);
      timeoutCleanup();
    }, 3000);
  };
  return (
    <div
      onMouseEnter={mouseEnter}
      onMouseLeave={mouseLeave}
      className={'icons hidden' + (active === true ? ' active' : '')}
    >
      <svg
        className={'svg mute-audio ' + (props.muteAudio ? 'on' : 'off')}
        onClick={props.clickMuteAudio}
        width='48'
        height='48'
        viewBox='-10 -10 68 68'
        xmlns='http://www.w3.org/2000/svg'
      >
        <circle className='circle' cx='24' cy='24' r='34'>
          <title>Mute audio</title>
        </circle>
        <path
          className='path on'
          transform='scale(0.6), translate(17,18)'
          d='M38 22h-3.4c0 1.49-.31 2.87-.87 4.1l2.46 2.46C37.33 26.61 38 24.38 38 22zm-8.03.33c0-.11.03-.22.03-.33V10c0-3.32-2.69-6-6-6s-6 2.68-6 6v.37l11.97 11.96zM8.55 6L6 8.55l12.02 12.02v1.44c0 3.31 2.67 6 5.98 6 .45 0 .88-.06 1.3-.15l3.32 3.32c-1.43.66-3 1.03-4.62 1.03-5.52 0-10.6-4.2-10.6-10.2H10c0 6.83 5.44 12.47 12 13.44V42h4v-6.56c1.81-.27 3.53-.9 5.08-1.81L39.45 42 42 39.46 8.55 6z'
          fill='white'
        />
        <path
          className='path off'
          transform='scale(0.6), translate(17,18)'
          d='M24 28c3.31 0 5.98-2.69 5.98-6L30 10c0-3.32-2.68-6-6-6-3.31 0-6 2.68-6 6v12c0 3.31 2.69 6 6 6zm10.6-6c0 6-5.07 10.2-10.6 10.2-5.52 0-10.6-4.2-10.6-10.2H10c0 6.83 5.44 12.47 12 13.44V42h4v-6.56c6.56-.97 12-6.61 12-13.44h-3.4z'
          fill='white'
        />
      </svg>
      <svg
        className={'svg mute-video ' + (props.muteVideo ? 'on' : 'off')}
        onClick={props.clickMuteVideo}
        width='48'
        height='48'
        viewBox='-10 -10 68 68'
      >
        <circle className='circle' cx='24' cy='24' r='34'>
          <title>Mute video</title>
        </circle>
        <path
          className='path on'
          transform='scale(0.6), translate(17,16)'
          d='M40 8H15.64l8 8H28v4.36l1.13 1.13L36 16v12.36l7.97 7.97L44 36V12c0-2.21-1.79-4-4-4zM4.55 2L2 4.55l4.01 4.01C4.81 9.24 4 10.52 4 12v24c0 2.21 1.79 4 4 4h29.45l4 4L44 41.46 4.55 2zM12 16h1.45L28 30.55V32H12V16z'
          fill='white'
        />
        <path
          className='path off'
          transform='scale(0.6), translate(17,16)'
          d='M40 8H8c-2.21 0-4 1.79-4 4v24c0 2.21 1.79 4 4 4h32c2.21 0 4-1.79 4-4V12c0-2.21-1.79-4-4-4zm-4 24l-8-6.4V32H12V16h16v6.4l8-6.4v16z'
          fill='white'
        />
      </svg>
      <svg
        className={'svg message hidden ' + (props.showMessage ? 'on' : 'off')}
        onClick={props.clickShowMessage}
        width='48'
        height='48'
        viewBox='-10 -10 68 68'
      >
        <circle className='circle' cx='24' cy='24' r='34'>
          <title>Message</title>
        </circle>
        <path
          className='path'
          transform='scale(1.1), translate(11,10)'
          d='M0 0h24v24H0V0z'
          fill='none'
        />
        <path
          className='path'
          transform='scale(1.1), translate(11,10)'
          d='M20 4H4v13.17L5.17 16H20V4zm-2 10H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z'
          opacity='0'
        />
        <path
          fill='white'
          className='path'
          transform='scale(1.1), translate(11,10)'
          d='M20 18c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14zm-16-.83V4h16v12H5.17L4 17.17zM6 12h12v2H6zm0-3h12v2H6zm0-3h12v2H6z'
        />
      </svg>
      <svg
        className={
          'svg switch-video hidden ' + (props.switchCam ? 'on' : 'off')
        }
        onClick={props.clickSwitchCam}
        width='48'
        height='48'
        viewBox='-10 -10 68 68'
      >
        <circle className='circle' cx='24' cy='24' r='34'>
          <title>
            {props.switchCam === true
              ? 'Switch To Front Camera'
              : 'Switch To Rear Camera'}
          </title>
        </circle>
        <path
          className='path'
          transform='scale(1.3), translate(7.5,6.5)'
          d='M14.12,5H9.88L8.05,7H4v12h16V7h-4.05L14.12,5z M12,18c-2.76,0-5-2.24-5-5H5l2.49-2.49L7.5,10.5L10,13H9.97 H8c0,2.21,1.79,4,4,4c0.58,0,1.13-0.13,1.62-0.35l0.74,0.74C13.65,17.76,12.86,18,12,18z M19,13l-2.49,2.49L16.5,15.5L14,13h0.03 H16c0-2.21-1.79-4-4-4c-0.58,0-1.13,0.13-1.62,0.35L9.64,8.62C10.35,8.24,11.14,8,12,8c2.76,0,5,2.24,5,5H19z'
          opacity='0'
        />
        <path
          fill='white'
          transform='scale(1.3), translate(7.5,6.5)'
          className='path'
          d='M20,5h-3.17L15,3H9L7.17,5H4C2.9,5,2,5.9,2,7v12c0,1.1,0.9,2,2,2h16c1.1,0,2-0.9,2-2V7C22,5.9,21.1,5,20,5z M20,19H4V7 h4.05l1.83-2h4.24l1.83,2H20V19z'
        />

        <path
          fill='white'
          transform='scale(1.3), translate(7.5,6.5)'
          className='path'
          d='M12,17c-2.21,0-4-1.79-4-4h1.97H10l-2.5-2.5l-0.01,0.01L5,13h2c0,2.76,2.24,5,5,5c0.86,0,1.65-0.24,2.36-0.62l-0.74-0.74 C13.13,16.87,12.58,17,12,17z'
        />

        <path
          fill='white'
          transform='scale(1.3), translate(7.5,6.5)'
          className='path'
          d='M12,8c-0.86,0-1.65,0.24-2.36,0.62l0.74,0.73C10.87,9.13,11.42,9,12,9c2.21,0,4,1.79,4,4h-1.97H14l2.5,2.5l0.01-0.01 L19,13h-2C17,10.24,14.76,8,12,8z'
        />
      </svg>
      <svg
        className={'svg hangup hidden ' + (props.hangup ? 'on' : 'off')}
        onClick={props.clickHangup}
        width='48'
        height='48'
        viewBox='-10 -10 68 68'
      >
        <circle className='circle' cx='24' cy='24' r='34'>
          <title>Hangup</title>
        </circle>
        <path
          className='path'
          transform='scale(0.7), translate(11,10)'
          d='M24 18c-3.21 0-6.3.5-9.2 1.44v6.21c0 .79-.46 1.47-1.12 1.8-1.95.98-3.74 2.23-5.33 3.7-.36.35-.85.57-1.4.57-.55 0-1.05-.22-1.41-.59L.59 26.18c-.37-.37-.59-.87-.59-1.42 0-.55.22-1.05.59-1.42C6.68 17.55 14.93 14 24 14s17.32 3.55 23.41 9.34c.37.36.59.87.59 1.42 0 .55-.22 1.05-.59 1.41l-4.95 4.95c-.36.36-.86.59-1.41.59-.54 0-1.04-.22-1.4-.57-1.59-1.47-3.38-2.72-5.33-3.7-.66-.33-1.12-1.01-1.12-1.8v-6.21C30.3 18.5 27.21 18 24 18z'
          fill='white'
        />
      </svg>

      {/* <svg
        className='svg fullscreen'
        width='48'
        height='48'
        viewBox='-10 -10 68 68'
      >
        <circle className='circle' cx='24' cy='24' r='34'>
          <title>Enter fullscreen</title>
        </circle>
        <path
          className='path on'
          transform='scale(0.8), translate(7,6)'
          d='M10 32h6v6h4V28H10v4zm6-16h-6v4h10V10h-4v6zm12 22h4v-6h6v-4H28v10zm4-22v-6h-4v10h10v-4h-6z'
          fill='white'
        />
        <path
          className='path off'
          transform='scale(0.8), translate(7,6)'
          d='M14 28h-4v10h10v-4h-6v-6zm-4-8h4v-6h6v-4H10v10zm24 14h-6v4h10V28h-4v6zm-6-24v4h6v6h4V10H28z'
          fill='white'
        />
      </svg> */}
    </div>
  );
};

//===================

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
  // const userVideoRef2 = useRef<any>();

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

  // ==== controls ===
  // muteAudio: boolean;
  // muteVideo: boolean;
  // hangup: boolean;
  // showMessage: boolean;
  // clickMuteAudio: () => void;
  // clickMuteVideo: () => void;
  // clickHangup: () => void;
  // clickShowMessage: () => void;

  const [muteAudio, setMuteAudio] = useState(false);
  const [muteVideo, setMuteVideo] = useState(false);
  const [hangup, setHangup] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [switchCam, setSwitchCam] = useState(false);

  const onClickMuteAudio = () => {
    setMuteAudio(muteAudio === false);
  };
  const onClickMuteVideo = () => {
    setMuteVideo(muteVideo === false);
  };
  const onClickHangup = () => {
    setHangup(hangup === false);
  };
  const onClickShowMessage = () => {
    setShowMessage(showMessage === false);
  };
  const onClickSwitchCam = () => {
    setSwitchCam(switchCam === false);
  };

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
    // userVideoRef2.current.srcObject = stream;
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
      {/* ======= Info ================ */}
      <h3>My User ID: {connection ? connection.userID() : undefined}</h3>
      <h3>User In Room:</h3>
      <ul>{stat}</ul>
      <hr></hr>
      {/* ======= Controls =========== */}
      <Control
        muteAudio={muteAudio}
        muteVideo={muteVideo}
        hangup={hangup}
        showMessage={showMessage}
        switchCam={switchCam}
        // =================
        clickHangup={onClickHangup}
        clickMuteAudio={onClickMuteAudio}
        clickMuteVideo={onClickMuteVideo}
        clickShowMessage={onClickShowMessage}
        clickSwitchCam={onClickSwitchCam}
      />
      {/* ======== User Video ======= */}
      <video
        muted
        className='mini-video active'
        ref={userVideoRef}
        autoPlay
        playsInline
      ></video>
      {/* ======= Peer Videos ============ */}
      {peerList.map((peer, index) => {
        if (index === 0) {
          return (
            <div key={index}>
              {index}
              <Video peer={peer} className='main-video active'></Video>
            </div>
          );
        } else {
          return (
            <div key={index}>
              {index}
              <Video peer={peer} className='mini-video active'></Video>
            </div>
          );
        }
      })}
      {/* ==================================== */}
    </div>
  );
});
