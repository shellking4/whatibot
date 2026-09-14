const { RemoteAuth } = require('whatsapp-web.js');

// WhatsApp states meaning this linked device was really logged out: only then is the saved session worthless.
const LOGGED_OUT_STATES = ['UNPAIRED', 'UNPAIRED_IDLE'];

// whatsapp-web.js RemoteAuth deletes the saved session (bucket zip + local profile) as soon as the client reaches
// any unexpected state (UNLAUNCHED, DEPRECATED_VERSION, PROXYBLOCK...), which forces a new QR scan even though the
// phone still has the device linked. This variant keeps the saved session unless the device was actually logged out.
export class SafeRemoteAuth extends RemoteAuth {
    private lastState: string | null = null;
    private loggedOut = false;

    constructor(options: { clientId: string, dataPath: string, store: any, backupSyncIntervalMs: number }) {
        super(options);
    }

    setup(client: any) {
        super.setup(client);
        // Client emits 'change_state' right before it calls disconnect(), so lastState is the reason for the disconnect
        client.on('change_state', (state: string) => {
            this.lastState = state;
        });
    }

    async logout() {
        this.loggedOut = true;
        return super.logout();
    }

    async disconnect() {
        if (this.loggedOut || LOGGED_OUT_STATES.includes(this.lastState)) {
            return super.disconnect();
        }
        console.warn(`[AUTH] client disconnected in state ${this.lastState}, keeping the saved session`);
        clearInterval(this.backupSync);
    }
}
