import React, { Component } from 'react';

import Landing from './Landing';
import Portfolio from './Portfolio';

class App extends Component {
  render() {
    return (
      <div className="App">
        <Landing />
        <Portfolio />
      </div>
    );
  }
}

export default App;
