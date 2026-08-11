import { DurableObject } from "cloudflare:workers";

const TICK = 200;

export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        if (url.pathname !== "/game") {
            return new Response("Mini Haven Multiplayer");
        }

        if (
            request.headers.get("Upgrade") !==
            "websocket"
        ) {
            return new Response(
                "WebSocket required",
                { status: 426 }
            );
        }

        const roomName =
            url.searchParams.get("room") ||
            "main";

        const id =
            env.GAME_ROOM.idFromName(roomName);

        const room =
            env.GAME_ROOM.get(id);

        return room.fetch(request);
    }
};


export class GameRoom extends DurableObject {

    constructor(ctx, env) {

        super(ctx, env);

        this.players = new Map();

        this.broadcastTimer = null;

        this.startBroadcastLoop();
    }


    /* =====================================================
       200ms SERVER BROADCAST LOOP
    ===================================================== */

    startBroadcastLoop() {

        if (this.broadcastTimer) {
            return;
        }

        const tick = () => {

            this.broadcastTimer = null;

            if (
                this.players.size > 0
            ) {

                this.broadcastSnapshot();
            }

            if (
                this.players.size > 0
            ) {

                this.broadcastTimer =
                    setTimeout(
                        tick,
                        TICK
                    );
            }
        };

        this.broadcastTimer =
            setTimeout(
                tick,
                TICK
            );
    }


    /* =====================================================
       CONNECTION
    ===================================================== */

    async fetch(request) {

        const pair =
            new WebSocketPair();

        const client =
            pair[0];

        const server =
            pair[1];

        const playerId =
            crypto.randomUUID();


        this.ctx.acceptWebSocket(
            server,
            [playerId]
        );


        const player = {

            id: playerId,

            name: "Player",

            x: 0,
            y: 0,

            color: "#4DA6FF",

            moveX: 0,
            moveY: 0,

            direction: "down",

            moving: false,

            aimAngle: 0,

            aiming: false
        };


        this.players.set(
            playerId,
            player
        );


        server.send(
            JSON.stringify({

                type: "welcome",

                id: playerId
            })
        );


        /* Send current room immediately */

        server.send(
            JSON.stringify({

                type: "snapshot",

                players:
                    [...this.players.values()]
            })
        );


        /* Tell other players */

        this.broadcast(
            {
                type: "playerJoined",

                player: player
            },
            server
        );


        this.startBroadcastLoop();


        return new Response(
            null,
            {
                status: 101,
                webSocket: client
            }
        );
    }


    /* =====================================================
       RECEIVE CLIENT DATA
    ===================================================== */

    webSocketMessage(
        ws,
        message
    ) {

        const tags =
            this.ctx.getTags(ws);

        const playerId =
            tags[0];

        if (!playerId) {
            return;
        }


        const player =
            this.players.get(
                playerId
            );

        if (!player) {
            return;
        }


        let data;

        try {

            data =
                JSON.parse(message);

        } catch {

            return;
        }


        /* =================================================
           JOIN
        ================================================= */

        if (
            data.type === "join"
        ) {

            if (
                typeof data.name ===
                "string"
            ) {

                player.name =
                    data.name.slice(
                        0,
                        20
                    );
            }


            if (
                typeof data.color ===
                "string"
            ) {

                player.color =
                    data.color;
            }


            this.updatePlayerState(
                player,
                data
            );


            this.startBroadcastLoop();

            return;
        }


        /* =================================================
           STATE
        ================================================= */

        if (
            data.type === "state"
        ) {

            this.updatePlayerState(
                player,
                data
            );


            this.startBroadcastLoop();

            return;
        }
    }


    /* =====================================================
       UPDATE STATE
    ===================================================== */

    updatePlayerState(
        player,
        data
    ) {

        if (
            Number.isFinite(data.x)
        ) {

            player.x =
                data.x;
        }


        if (
            Number.isFinite(data.y)
        ) {

            player.y =
                data.y;
        }


        if (
            Number.isFinite(data.moveX)
        ) {

            player.moveX =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        data.moveX
                    )
                );
        }


        if (
            Number.isFinite(data.moveY)
        ) {

            player.moveY =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        data.moveY
                    )
                );
        }


        if (
            typeof data.name ===
            "string"
        ) {

            player.name =
                data.name.slice(
                    0,
                    20
                );
        }


        if (
            typeof data.color ===
            "string"
        ) {

            player.color =
                data.color;
        }


        if (
            typeof data.direction ===
            "string"
        ) {

            player.direction =
                data.direction;
        }


        if (
            Number.isFinite(
                data.aimAngle
            )
        ) {

            player.aimAngle =
                data.aimAngle;
        }


        player.moving =
            Boolean(
                data.moving
            );


        player.aiming =
            Boolean(
                data.aiming
            );
    }


    /* =====================================================
       BROADCAST SNAPSHOT
    ===================================================== */

    broadcastSnapshot() {

        if (
            this.players.size === 0
        ) {
            return;
        }


        const snapshot = {

            type:
                "snapshot",

            players:
                [...this.players.values()]
        };


        this.broadcast(
            snapshot
        );
    }


    /* =====================================================
       DISCONNECT
    ===================================================== */

    webSocketClose(ws) {

        this.removePlayer(ws);
    }


    webSocketError(ws) {

        this.removePlayer(ws);
    }


    removePlayer(ws) {

        const tags =
            this.ctx.getTags(ws);

        const playerId =
            tags[0];

        if (!playerId) {
            return;
        }


        this.players.delete(
            playerId
        );


        this.broadcast({

            type:
                "playerLeft",

            id:
                playerId
        });
    }


    /* =====================================================
       BROADCAST
    ===================================================== */

    broadcast(
        data,
        except = null
    ) {

        const message =
            JSON.stringify(
                data
            );


        for (
            const ws of
            this.ctx.getWebSockets()
        ) {

            if (
                ws === except
            ) {
                continue;
            }


            if (
                ws.readyState ===
                WebSocket.OPEN
            ) {

                try {

                    ws.send(
                        message
                    );

                } catch {

                    // closed socket
                }
            }
        }
    }
}
