/* global SillyTavern */
import backgroundImage from './assets/background/Captura.PNG';

function App() {
    // This component is not directly used for the game UI,
    // as src/index.js injects the game into the chat directly,
    // following the pattern of the reference code.
    // It's kept minimal to satisfy the project structure.
    return (
        <div style={{
            display: 'none',
            backgroundImage: `url(${backgroundImage})`,
        }}>
            Tic-Tac-Toe Extension Core Logic Loaded.
        </div>
    );
}

export default App;
