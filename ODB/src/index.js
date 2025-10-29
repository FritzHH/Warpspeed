import { AppRegistry } from 'react-native';
import App from './App';

// Register the app
AppRegistry.registerComponent('ODB', () => App);

// Run the app on web
AppRegistry.runApplication('ODB', {
  rootTag: document.getElementById('root'),
});

