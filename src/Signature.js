import React from 'react';
import Typist from 'react-typist';

class Signature extends React.Component {
  constructor(props){
    super(props);
    this.state = {
      typing: true
    }
  }
done = () => {
  this.setState({ typing: false }, () => {
    this.setState({ typing: true })
  });
}

  render() {
    return (
      <div>
        <div className="triangle" />
        {this.state.typing
            ? <Typist className="signature" avgTypingDelay={40} onTypingDone={this.done}>
              <span>🧁🧁🧁</span>
              <Typist.Backspace count={6} delay={1000} />
              <span>OMG YES CUPCAKE🧁</span>
              <Typist.Backspace count={15} delay={200} />
              </Typist>
            : ''
          }
      </div>
    );
  }
}

export default Signature;
