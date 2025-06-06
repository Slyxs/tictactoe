/* global SillyTavern */

import kaplay from "kaplay";
import './styles.css';

let kaplayInstancesLaunched = 0;

class KaplayCanvasInstance {
  constructor() {
    this.instanceId = `sillytavern-kaplaycanvas-${Math.random()
      .toString(36)
      .substring(2)}`;
    this.kaplayRootElement = null;
    this.k = null; // To store the Kaplay context
  }

  async launch() {
    kaplayInstancesLaunched++;
    const context = SillyTavern.getContext();
    context.sendSystemMessage("generic", this.instanceId);

    // Find the chat message element
    // This logic remains similar to how TicTacToe found its message element
    let chatMessage;
    let messageText;

    const tryFindMessage = () => {
      const chat = document.getElementById("chat");
      if (!chat) return false;

      const lastMessage = chat.querySelector(".last_mes");
      if (lastMessage && lastMessage.querySelector(".mes_text")?.textContent.includes(this.instanceId)) {
        chatMessage = lastMessage;
        messageText = chatMessage.querySelector(".mes_text");
        return true;
      }

      // Fallback search
      const messages = Array.from(chat.querySelectorAll(".mes_text"));
      const targetMessageText = messages.find((m) =>
        m.textContent.includes(this.instanceId)
      );
      if (targetMessageText) {
        messageText = targetMessageText;
        chatMessage = targetMessageText.closest(".mes");
        return true;
      }
      return false;
    };

    // Wait a bit for the message to appear in DOM if necessary
    if (!tryFindMessage()) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Short delay
        if (!tryFindMessage()) {
            console.error(
              "KaplayCanvas: Could not find the chat message for instanceId:",
              this.instanceId
            );
            // Clean up the system message if we can't find its UI
            const msgIdx = context.chat.findIndex(m => m.mes === this.instanceId);
            if (msgIdx !== -1) {
                context.chat.splice(msgIdx, 1);
                context.saveChat();
            }
            return;
        }
    }
    
    // Modify the message content
    if (context.chat && Array.isArray(context.chat)) {
        const messageIndex = context.chat.findIndex(m => m.mes === this.instanceId);
        if (messageIndex !== -1) {
            context.chat[messageIndex].mes = `[Kaplay Canvas Initialized]`;
        }
    }

    chatMessage.classList.remove("last_mes");
    messageText.innerHTML = ""; // Clear "system message" text

    this.kaplayRootElement = document.createElement("div");
    this.kaplayRootElement.id = `kaplay-root-${this.instanceId}`;
    this.kaplayRootElement.style.width = "100%";
    this.kaplayRootElement.style.height = "250px"; // Define a height for the canvas area
    this.kaplayRootElement.style.backgroundColor = "#333"; // A default background for the root
    messageText.appendChild(this.kaplayRootElement);
    
    // Ensure the chat message bubble itself doesn't have excessive padding
    // that would shrink the Kaplay area. .mes_text is the target.
    messageText.style.padding = "0"; // Or a small padding if desired e.g. "5px"
    messageText.style.overflow = "hidden"; // Prevent scrollbars if Kaplay canvas is exact fit

    // Initialize Kaplay
    // We need to ensure clientWidth/Height are available.
    // Using a timeout to allow the DOM to update with the new element's dimensions.
    setTimeout(() => {
        if (!this.kaplayRootElement) return; // Instance might have been destroyed

        this.k = kaplay({
            root: this.kaplayRootElement,
            width: this.kaplayRootElement.clientWidth,
            height: this.kaplayRootElement.clientHeight,
            background: [0, 0, 0, 1], // Default background color (black)
            crisp: true,
        });

        // Load assets
        // Ensure CAPTURA.PNG is in a location like 'public/sprites/CAPTURA.PNG'
        // or adjust the path.
        this.k.loadSprite("backgroundImage", "sprites/CAPTURA.PNG");

        // Add the background image (the map to be traveled)
        const backgroundMap = this.k.add([
            this.k.sprite("backgroundImage"),
            this.k.pos(0, 0), // Position at top-left corner
            this.k.anchor("topleft"),
            this.k.z(-1), // Ensure it's drawn behind other game objects
        ]);

        // Player properties
        const PLAYER_SIZE = 32;
        const PLAYER_MOVE_SPEED = 200; // Pixels to move per key event

        // Add player (a red square)
        const player = this.k.add([
            this.k.rect(PLAYER_SIZE, PLAYER_SIZE),
            this.k.pos(this.k.width() / 2, this.k.height() / 2), // Initial position: center of the screen
            this.k.anchor("center"),
            this.k.color(255, 0, 0), // Red
            this.k.area(), // For potential collision detection later
            "player", // Tag
        ]);

        // Player movement and boundary checks
        const checkPlayerBounds = () => {
            const halfSize = player.width / 2; // Assuming square player for simplicity with anchor("center")
            player.pos.x = Math.max(halfSize, Math.min(this.k.width() - halfSize, player.pos.x));
            player.pos.y = Math.max(halfSize, Math.min(this.k.height() - halfSize, player.pos.y));
        };

        this.k.onKeyDown("left", () => {
            player.move(-PLAYER_MOVE_SPEED, 0);
        });
        this.k.onKeyDown("right", () => {
            player.move(PLAYER_MOVE_SPEED, 0);
        });
        this.k.onKeyDown("up", () => {
            player.move(0, -PLAYER_MOVE_SPEED);
        });
        this.k.onKeyDown("down", () => {
            player.move(0, PLAYER_MOVE_SPEED);
        });
        
        // Camera control: make the camera follow the player
        this.k.onUpdate(() => {
            // Center the camera on the player's position.
            // This allows traveling on a map larger than the screen.
            this.k.camPos(player.pos);
        });

        // Add a close button (retained from previous example)
        const closeButton = this.k.add([
            this.k.rect(80, 30, { radius: 5 }),
            this.k.pos(this.k.width() - 10, 10),
            this.k.anchor("topright"),
            this.k.color(200, 50, 50),
            this.k.area(),
            this.k.z(100), // Ensure button is on top
            "close_kaplay_button"
        ]);
        closeButton.add([
            this.k.text("Close", { size: 16 }),
            this.k.anchor("center"),
            this.k.color(255,255,255)
        ]);
        this.k.onClick("close_kaplay_button", () => {
            this.destroy();
            messageText.innerHTML = "[Kaplay Canvas Closed]";
            messageText.style.padding = ""; 
            chatMessage.style.order = ""; 
             const msgIdx = context.chat.findIndex(m => m.mes === `[Kaplay Canvas Initialized]` || m.mes === this.instanceId);
             if (msgIdx !== -1) {
                 context.chat[msgIdx].mes = "[Kaplay Canvas Closed by user]";
                 context.forceUpdateChat(); 
             }
        });

    }, 50); // Small delay for DOM to report correct clientWidth/Height

    const order = (20000 + kaplayInstancesLaunched).toFixed(0); // Ensure it's distinct
    chatMessage.style.order = order;
    const chatScrollElement = document.getElementById("chat");
    if (chatScrollElement) chatScrollElement.scrollTop = chatScrollElement.scrollHeight;
  }

  destroy() {
    if (this.k) {
        this.k.quit(); // Properly shut down Kaplay instance
        this.k = null;
    }
    if (this.kaplayRootElement && this.kaplayRootElement.parentElement) {
        this.kaplayRootElement.parentElement.removeChild(this.kaplayRootElement);
    }
    this.kaplayRootElement = null;
    // Any other cleanup
  }
}

async function launchKaplayCanvas() {
    const instance = new KaplayCanvasInstance();
    return instance.launch();
}

function addLaunchButton() {
    const launchButton = document.createElement('div');
    launchButton.id = 'kaplay-canvas-launch';
    launchButton.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    launchButton.tabIndex = 0;
    launchButton.title = 'Launch Kaplay Canvas Demo';
    const kIcon = document.createElement('i');
    kIcon.classList.add('fa-solid', 'fa-cubes'); // Icon for Kaplay/3D/Game
    launchButton.appendChild(kIcon);
    const kText = document.createElement('span');
    kText.textContent = 'Kaplay Canvas';
    launchButton.appendChild(kText);

    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) {
        console.error('KaplayCanvas: Could not find the extensions menu');
        return;
    }
    
    const chessWandContainer = document.getElementById('chess_wand_container');
    const targetMenu = chessWandContainer || extensionsMenu;

    targetMenu.classList.add('interactable');
    targetMenu.tabIndex = 0;
    targetMenu.appendChild(launchButton);
    launchButton.addEventListener('click', launchKaplayCanvas);
}

(function () {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        addLaunchButton();
    } else {
        document.addEventListener('DOMContentLoaded', addLaunchButton);
    }

    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.makeLast(event_types.CHAT_CHANGED, () => {
        const { chatMetadata } = SillyTavern.getContext();
        for (const key in chatMetadata) {
            if (/sillytavern-kaplaycanvas-[a-z0-9]+$/.test(key)) {
                console.log('KaplayCanvas: Removing stuck inject/metadata for', key);
                delete chatMetadata[key];
                // Potentially find and destroy orphaned Kaplay instances if possible, though tricky.
            }
        }
    });
})();
