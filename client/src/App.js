import React, { useEffect } from 'react';
import './App.css';

import io from 'socket.io-client';
import adapter from 'webrtc-adapter';

function App() {
  console.log('Yo!');

  const gDefaultMedaiConstraint = {
    audio: false,
    video: true,
  };
  const gMediaConstraints = [
    // Constraints object for low resolution video
    {
      video: {
        mandatory: {
          maxWidth: 320,
          maxHeight: 240,
        },
      },
    },
    // Constraints object for standard resolution video
    {
      video: {
        mandatory: {
          maxWidth: 640,
          maxHeight: 480,
        },
      },
    },
    // Constraints object for high resolution video
    {
      video: {
        mandatory: {
          minWidth: 1280,
          minHeight: 960,
        },
      },
    },
  ];

  // ===================== Variables Init ======================
  let vLocal;
  let vRemote;
  let sCamSettings;
  let btnStart;
  let btnVidCall;
  let btnVidHangup;

  // const btnDataStart = document.getElementById("data-start-but")
  let btnDataSend;
  let tbSendData;
  let tbRecvData;
  // const btnDataClose = document.getElementById("data-send-but")

  let gLocalStream = null;
  let gLocalPeerConnection = null;

  let gSendChannel = null;
  let gRecvChannel = null;

  let gIsChannelReady = false;
  let gIsInitiator = false;
  let gIsStarted = false;

  // const kLocalPeerConnection_Config = {
  //     'iceServers': [
  //         {
  //             'urls': 'stun:stun.l.google.com:19302'
  //         }
  //     ]
  // };
  let kLocalPeerConnection_Config = null;

  const kLocalPeerConnection_Constraints = {
    optional: [
      {
        DtlsSrtpKeyAgreement: true,
      },
    ],
  };
  const kSdp_Constraints = {};

  // ================== Diagnostic Setup =======================
  const gEnableDiagStatus = true;

  let sUserType;
  let sUserRoom;
  let sSocketStat;
  let sSendChanStat;
  let sRecvChanStat;
  let sPeerConStat;

  let sIceConStat;
  let sIceGatStat;

  let tbIceOwn;
  let tbIcePeer;
  let tbSocket;
  let tbLog;

  const enumLog_Diag = {
    eOwnIceCand: 1,
    ePeerIceCand: 2,
    eSocketMsg: 3,
  };
  Object.freeze(enumLog_Diag);

  let log;
  let gSocket;
  let gRoom = '';

  const sendMessage = (message) => {
    log('Sending message: ' + JSON.stringify(message), enumLog_Diag.eSocketMsg);
    gSocket.emit('message', message);
  };

  const checkAndStart = () => {
    if (!gIsStarted && gIsChannelReady) {
      CreateLocalPeerConnection(function (result) {
        if (result) {
          gIsStarted = true;
          if (gIsInitiator) {
            CreateOffer();
          }
        } else {
          log('create local peer connection failed');
        }
      }, gIsInitiator);
    }
  };

  const init = () => {
    btnStart.disabled = false;
    btnVidCall.disabled = true;
    btnVidHangup.disabled = true;
    sCamSettings.disabled = true;
    btnDataSend.disabled = true;

    gIsStarted = false;

    if (gLocalPeerConnection) {
      gLocalPeerConnection.close();
      gLocalPeerConnection = null;
    }
    if (gSendChannel) {
      gSendChannel.close();
      gSendChannel = null;
    }
    if (gRecvChannel) {
      gRecvChannel.close();
      gRecvChannel = null;
    }
  };

  // btnStart.addEventListener('click', function () {
  //   // getLocalStream(gDefaultMedaiConstraint, function(result) {
  //   //     if (result) {
  //   //         btnVidCall.disabled  = false;
  //   //         btnStart.disabled = true;
  //   //         CreateLocalPeerConnection(function(result){
  //   //             console.log('------- setup! ------')
  //   //         }, gIsInitiator);
  //   //     } else {
  //   //         btnStart.disabled = false;
  //   //     }
  //   // })
  // });

  // btnDataStart.addEventListener('click', function() {

  // })
  const getLocalStream = (contraints) => {
    navigator.mediaDevices
      .getUserMedia(contraints)
      .then(function (mediaStream) {
        gLocalStream = mediaStream;
        vLocal.srcObject = mediaStream;
        vLocal.play();

        if (gLocalStream.getVideoTracks().length > 0) {
          log('video on');
        }
        if (gLocalStream.getAudioTracks().length > 0) {
          log('audio on');
        }
        sendMessage({
          type: 'got user media',
          result: true,
        });
      })
      .catch(function (error) {
        log(JSON.stringify(error));
        sendMessage({
          type: 'got user media',
          result: false,
        });
      });
  };
  const CreateLocalPeerConnection = (cb, isInitiator) => {
    try {
      // gLocalPeerConnection = new RTCPeerConnection(
      //   kLocalPeerConnection_Config,
      //   kLocalPeerConnection_Constraints
      // );
      gLocalPeerConnection = new RTCPeerConnection(kLocalPeerConnection_Config);

      gLocalPeerConnection.addEventListener('icecandidate', function (event) {
        if (event.candidate) {
          if (event.candidate.candidate.indexOf('relay') < 0) {
            //TODO: hack! only return stun server candidates, relay...
            return;
          }
          log(
            'local ICE --> ' + JSON.stringify(event.candidate.candidate),
            enumLog_Diag.eOwnIceCand
          );
          // sendMessage( {
          //     type: 'candidate',
          //     label: event.candidate.sdpMLineIndex,
          //     id: event.candidate.sdpMid,
          //     candidate: event.candidate.candidate
          // })

          sendMessage({
            type: 'candidate',
            candidate: event.candidate,
          });
        }
      });

      //Initialize MediaSteam
      if (gLocalStream) {
        gLocalPeerConnection.addStream(gLocalStream);
      }
      gLocalPeerConnection.addEventListener('addstream', function (event) {
        let remoteStream = event.stream;
        log('remote stream added -->');
        log(remoteStream);
        vRemote.srcObject = remoteStream;
      });
      gLocalPeerConnection.addEventListener('removestream', function (event) {
        log('remote stream removed');
      });

      //Intialize Data Channel
      if (isInitiator) {
        gSendChannel = gLocalPeerConnection.createDataChannel(
          'sendDataChannel',
          { reliable: true }
        );
        gSendChannel.addEventListener('open', function (event) {
          tbSendData.disabled = false;
          tbSendData.focus();
          tbSendData.placeholder = '';
          btnDataSend.disabled = false;
        });
        gSendChannel.addEventListener('message', function (event) {
          let recievedText = event.data;
          tbRecvData.value += recievedText + '\n';
        });
        gSendChannel.addEventListener('close', function (event) {
          tbSendData.disabled = true;
          tbSendData.placeholder = '';
          btnDataSend.disabled = true;
        });
        log('created data channel');
      } else {
        gLocalPeerConnection.addEventListener('datachannel', function (event) {
          gRecvChannel = event.channel;
          gRecvChannel.addEventListener('message', function (event) {
            let recievedText = event.data;
            tbRecvData.value += recievedText + '\n';
          });
          gRecvChannel.addEventListener('open', function (event) {
            tbSendData.disabled = false;
            tbSendData.focus();
            tbSendData.placeholder = '';
            btnDataSend.disabled = false;
          });
          gRecvChannel.addEventListener('close', function (event) {
            tbSendData.disabled = true;
            tbSendData.placeholder = '';
            btnDataSend.disabled = true;
          });
        });
      }

      if (cb) {
        cb(true);
      }
    } catch (e) {
      log(JSON.stringify(e));
      if (cb) {
        cb(false);
      }
    }
  };
  const CreateAnswer = () => {
    gLocalPeerConnection.createAnswer(
      function (description) {
        gLocalPeerConnection.setLocalDescription(description);
        sendMessage({
          type: 'answer',
          description: description,
        });
        log('sending answer to peer --> ' + JSON.stringify(description));
      },
      function (e) {
        log('create answer error -->' + JSON.stringify(e));
        sendMessage({
          type: 'answer',
          description: null,
        });
      },
      kSdp_Constraints
    );
  };
  const CreateOffer = () => {
    gLocalPeerConnection.createOffer(
      function (description) {
        gLocalPeerConnection.setLocalDescription(description);
        sendMessage({
          type: 'offer',
          description: description,
        });
        log('sending offer to peer --> ' + JSON.stringify(description));
      },
      function (e) {
        log('create offer error --> ' + JSON.stringify(e));
        sendMessage({
          type: 'offer',
          description: null,
        });
      }
    );
  };

  useEffect(() => {
    // === initialize socket ===
    gSocket = io.connect('http://localhost:5000/voice-video');
    gSocket.on('message', function (message) {
      log(
        'Recieved message:' + JSON.stringify(message),
        enumLog_Diag.eSocketMsg
      );
      if (message.type === 'got user media') {
        checkAndStart();
      } else if (message.type === 'offer') {
        checkAndStart();
        gLocalPeerConnection.setRemoteDescription(
          new RTCSessionDescription(message.description)
        );
        CreateAnswer();
      } else if (message.type === 'answer') {
        gLocalPeerConnection.setRemoteDescription(message.description);
        log('answer recieved, connection established!!');
      } else if (message.type === 'candidate') {
        let candidate = null;
        try {
          // candidate = new RTCIceCandidate({
          //     sdpMLineIndex: message.label,
          //     candidate: message.candidate
          // })
          candidate = new RTCIceCandidate(message.candidate);
        } catch (e) {
          log(e);
        }
        log(
          'peer ice -->' + JSON.stringify(candidate),
          enumLog_Diag.ePeerIceCand
        );
        gLocalPeerConnection.addIceCandidate(candidate);
      }
    });
    gSocket.on('created', function (info) {
      log('created room: ' + JSON.stringify(info.room));
      gIsInitiator = true;
      kLocalPeerConnection_Config = info.config;
      getLocalStream(gDefaultMedaiConstraint);
    });
    gSocket.on('join', function (room) {
      log('somebody joined');
      gIsChannelReady = true;
    });
    gSocket.on('joined', function (info) {
      log('joiner of:' + JSON.stringify(info.room));
      gIsChannelReady = true;
      kLocalPeerConnection_Config = info.config;
      console.log('local-peer-connection config:', kLocalPeerConnection_Config);
      getLocalStream(gDefaultMedaiConstraint);
    });

    // ================== User Control Setup ====================
    vLocal = document.getElementById('local-video');
    vRemote = document.getElementById('remote-video');
    sCamSettings = document.getElementById('cam-qual');
    btnStart = document.getElementById('vid-start-but');
    btnVidCall = document.getElementById('vid-call-but');
    btnVidHangup = document.getElementById('vid-hangup-but');

    // const btnDataStart = document.getElementById("data-start-but")
    btnDataSend = document.getElementById('data-send-but');
    tbSendData = document.getElementById('tb-send');
    tbRecvData = document.getElementById('tb-recv');

    sCamSettings.addEventListener('change', function () {
      let value = sCamSettings.options[sCamSettings.selectedIndex].value;
      getLocalStream(gMediaConstraints[value]);
    });
    btnVidCall.addEventListener('click', function () {
      CreateLocalPeerConnection();
    });
    btnDataSend.addEventListener('click', function () {
      let data = tbSendData.value;
      if (gIsInitiator) {
        gSendChannel.send(data);
      } else {
        gRecvChannel.send(data);
      }
    });
    btnVidHangup.addEventListener('click', function () {
      init();
      log('Session terminated');
    });
    // ================== Diagnostic Setup =======================
    sUserType = document.getElementById('s-user-type');
    sUserRoom = document.getElementById('s-room');
    sSocketStat = document.getElementById('s-socket-stat');
    sSendChanStat = document.getElementById('s-send-channel-stat');
    sRecvChanStat = document.getElementById('s-recv-channel-stat');
    sPeerConStat = document.getElementById('s-peer-con-stat');

    sIceConStat = document.getElementById('s-ice-con-state');
    sIceGatStat = document.getElementById('s-ice-gat-state');

    tbIceOwn = document.getElementById('tb-ice-own');
    tbIcePeer = document.getElementById('tb-ice-peer');
    tbSocket = document.getElementById('tb-socket');
    tbLog = document.getElementById('tb-log');

    log = (message, dianosticType) => {
      console.log(message);

      if (gEnableDiagStatus === true) {
        tbLog.value += message + '\n';
        if (dianosticType) {
          if (dianosticType === enumLog_Diag.eOwnIceCand) {
            tbIceOwn.value += message + '\n';
          } else if (dianosticType === enumLog_Diag.ePeerIceCand) {
            tbIcePeer.value += message + '\n';
          } else if (dianosticType === enumLog_Diag.eSocketMsg) {
            tbSocket.value += message + '\n';
          } else {
            console.log('Diagnostic Type Error:', dianosticType);
          }
        }
      }
    };
    // ===== initialize diagnostic monitoring =======
    if (gEnableDiagStatus) {
      const dianostic_status = () => {
        sUserType.innerText = gIsInitiator ? 'Owner' : 'Joiner';
        sUserRoom.innerText = gRoom;
        sSocketStat.innerText = gSocket.connected;

        if (gSendChannel) {
          sSendChanStat.innerText = gSendChannel.readyState;
        } else {
          sSendChanStat.innerText = 'null';
        }
        if (gRecvChannel) {
          sRecvChanStat.innerText = gRecvChannel.readyState;
        } else {
          sRecvChanStat.innerText = 'null';
        }
        if (gLocalPeerConnection) {
          sPeerConStat.innerText = gLocalPeerConnection.connectionState;
          sIceConStat.innerText = gLocalPeerConnection.iceConnectionState;
          sIceGatStat.innerText = gLocalPeerConnection.iceGatheringState;
        } else {
          sPeerConStat.innerText = 'null';
          sIceConStat.innerText = 'null';
          sIceGatStat.innerText = 'null';
        }
      };
      setInterval(dianostic_status, 1000);
    }

    gRoom = prompt('Enter room name'); //TODO: remove later

    if (gRoom != '' && gRoom != null) {
      log('creating room: ' + JSON.stringify(gRoom));
      gSocket.emit('create or join', gRoom);
    }
    return () => {
      // cleanup;
    };
  }, []);

  return (
    <div className='App'>
      <header className='App-header'>
        <table border='1' width='100%'>
          <tbody>
            <tr>
              <th>Local Video</th>
              <th>Remote Video</th>
            </tr>
            <tr>
              <td align='center'>
                <video
                  id='local-video'
                  className='camera'
                  playsInline
                  autoPlay
                ></video>
                <select id='cam-qual'>
                  <option value={0}>Low</option>
                  <option value={1}>Standard</option>
                  <option value={2}>HD</option>
                </select>
              </td>
              <td align='center'>
                <video
                  id='remote-video'
                  className='camera'
                  playsInline
                  autoPlay
                ></video>
              </td>
            </tr>
            <tr>
              <td align='center'>
                <textarea
                  rows='5'
                  cols='50'
                  id='tb-send'
                  disabled
                  placeholder=''
                ></textarea>
              </td>
              <td align='center'>
                <textarea
                  rows='5'
                  cols='50'
                  id='tb-recv'
                  disabled
                  placeholder=''
                ></textarea>
              </td>
            </tr>
          </tbody>
        </table>
        <div>
          <button id='vid-start-but'>Start</button>
          <button id='vid-call-but'>Call</button>
          <button id='vid-hangup-but'>Hangup</button>
          <button id='data-send-but'>Send</button>
        </div>
        <div id='diagnostic-panel'>
          <div>
            User Type: <span id='s-user-type'></span>
          </div>
          <div>
            Room ID: <span id='s-room'></span>
          </div>
          <div>
            Socket Status: <span id='s-socket-stat'></span>
          </div>
          <div>
            Send Data Channel Status: <span id='s-send-channel-stat'></span>
          </div>
          <div>
            Recv Data Channel Status: <span id='s-recv-channel-stat'></span>
          </div>
          <div>
            Peer Connection Status: <span id='s-peer-con-stat'></span>
          </div>
          <div>
            Ice Connection State: <span id='s-ice-con-state'></span>
          </div>
          <div>
            Ice Gathering State: <span id='s-ice-gat-state'></span>
          </div>

          <div>Own ICE Candidate:</div>
          <textarea rows='5' cols='50' id='tb-ice-own'></textarea>
          <div>Peer ICE Candidate:</div>
          <textarea rows='5' cols='50' id='tb-ice-peer'></textarea>
          <div>Socket Message:</div>
          <textarea rows='5' cols='50' id='tb-socket'></textarea>
          <div>Log:</div>
          <textarea rows='5' cols='50' id='tb-log'></textarea>
          <div>ALL LOG:</div>
          <textarea rows='5' cols='50' id='tb-all-log'></textarea>
        </div>
      </header>
    </div>
  );
}

export default App;
