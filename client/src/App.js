import React, { useEffect, useRef, useState } from 'react';
import { withRouter, Route, Switch, Redirect } from 'react-router-dom';
import './App.css';
import Peer from 'simple-peer';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Connection } from './Connection.tsx';
import { Room } from './Room';

const App = (props) => {
  const [connection, setUserDB] = useState();
  const [roomPath, setRoomPath] = useState(null);

  useEffect(() => {
    (async () => {
      const userDB = await Connection();
      setUserDB(userDB);
    })();
  }, []);

  const createRoom = async () => {
    const roomId = await connection.createRoom();
    setRoomPath(`/room/${roomId}`);
  };
  return (
    <HashRouter basename='/'>
      <React.StrictMode>
        <button onClick={createRoom}>Create Room</button>
        {roomPath ? <Redirect to={roomPath} /> : undefined}
        <Switch>
          <Route
            path='/room/:id'
            component={() => <Room {...props} connection={connection} />}
          ></Route>
        </Switch>
      </React.StrictMode>
    </HashRouter>
  );
};

export default App;
