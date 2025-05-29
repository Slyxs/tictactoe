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
            background: [20, 20, 50], // Dark blue background for Kaplay
            crisp: true,
        });

        // Simple Kaplay scene
        this.k.add([
            this.k.rect(this.k.width() * 0.8, this.k.height() * 0.8),
            this.k.pos(this.k.center()),
            this.k.anchor("center"),
            this.k.color(100, 100, 255), // A blueish rectangle
            this.k.outline(4, this.k.rgb(255,255,255)),
        ]);
        this.k.add([
            this.k.text("Kaplay Active!", { size: Math.min(this.k.width()/10, 24) }),
            this.k.pos(this.k.center()),
            this.k.anchor("center"),
            this.k.color(255, 255, 255),
        ]);

        // Add a close button within Kaplay (optional, example)
        const closeButton = this.k.add([
            this.k.rect(80, 30, { radius: 5 }),
            this.k.pos(this.k.width() - 10, 10),
            this.k.anchor("topright"),
            this.k.color(200, 50, 50),
            this.k.area(),
            "close_kaplay_button"
        ]);
        closeButton.add([
            this.k.text("Close", { size: 16 }),
            this.k.anchor("center"),
            this.k.color(255,255,255)
        ]);
        this.k.onClick("close_kaplay_button", () => {
            this.destroy();
            // Restore original message or a placeholder
            messageText.innerHTML = "[Kaplay Canvas Closed]";
            messageText.style.padding = ""; // Reset padding
            chatMessage.style.order = ""; // Reset order
            // Potentially remove the chat message or update it in context.chat
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
