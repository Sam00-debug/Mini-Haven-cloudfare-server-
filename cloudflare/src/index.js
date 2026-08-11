import { DurableObject } from "cloudflare:workers";

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
                {
                    status: 426
                }
            );
        }

        const roomName =
            url.searchParams.get("room") ||
            "main";

        const id =
            env.GAME_ROOM.idFromName(
                roomName
            );

        const room =
            env.GAME_ROOM.get(id);

        return room.fetch(request);
    }
};


/* =====================================================
   GAME ROOM
===================================================== */

export class GameRoom extends DurableObject {

    constructor(ctx, env) {

        super(ctx, env);

        this.players = new Map();
    }


    /* =================================================
       WEBSOCKET CONNECTION
    ================================================= */

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


        /* =============================================
           CREATE PLAYER
        ============================================= */

        const player = {

            id: playerId,

            name: "Player",

            x: 0,
            y: 0,

            color: "#4DA6FF",

            /* Movement direction */

            direction: "down",

            moving: false,

            /* 360 degree gun aim */

            aimAngle: 0,

            /* Whether the player is aiming */

            aiming: false,

            animationTime: 0
        };


        this.players.set(
            playerId,
            player
        );


        /* =============================================
           SEND REAL SERVER ID
        ============================================= */

        server.send(
            JSON.stringify({

                type: "welcome",

                id: playerId
            })
        );


        /* =============================================
           SEND CURRENT PLAYERS
        ============================================= */

        server.send(
            JSON.stringify({

                type: "players",

                players: [
                    ...this.players.values()
                ]
            })
        );


        /* =============================================
           INFORM OTHER PLAYERS
        ============================================= */

        this.broadcast(
            {
                type: "playerJoined",

                player: player
            },

            server
        );


        return new Response(
            null,
            {
                status: 101,

                webSocket: client
            }
        );
    }


    /* =================================================
       MESSAGE
    ================================================= */

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


        let data;

        try {

            data =
                JSON.parse(message);

        } catch {

            return;
        }


        const player =
            this.players.get(
                playerId
            );


        if (!player) {
            return;
        }


        /* =============================================
           JOIN
        ============================================= */

        if (
            data.type === "join"
        ) {

            if (
                typeof data.name ===
                "string"
            ) {

                player.name =
                    data.name
                        .slice(0, 20);
            }


            if (
                typeof data.color ===
                "string"
            ) {

                player.color =
                    data.color;
            }


            if (
                Number.isFinite(
                    data.x
                )
            ) {

                player.x =
                    data.x;
            }


            if (
                Number.isFinite(
                    data.y
                )
            ) {

                player.y =
                    data.y;
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


            this.broadcast({

                type:
                    "playerUpdate",

                player:
                    player

            });


            return;
        }


        /* =============================================
           PLAYER STATE
        ============================================= */

        if (
            data.type === "state"
        ) {

            /* Position */

            if (
                Number.isFinite(
                    data.x
                )
            ) {

                player.x =
                    data.x;
            }


            if (
                Number.isFinite(
                    data.y
                )
            ) {

                player.y =
                    data.y;
            }


            /* Name */

            if (
                typeof data.name ===
                "string"
            ) {

                player.name =
                    data.name
                        .slice(0, 20);
            }


            /* Color */

            if (
                typeof data.color ===
                "string"
            ) {

                player.color =
                    data.color;
            }


            /* Movement direction */

            if (
                typeof data.direction ===
                "string"
            ) {

                player.direction =
                    data.direction;
            }


            /* Movement */

            player.moving =
                Boolean(
                    data.moving
                );


            /* =========================================
               360° AIM
            ========================================= */

            if (
                Number.isFinite(
                    data.aimAngle
                )
            ) {

                player.aimAngle =
                    data.aimAngle;
            }


            /* =========================================
               AIMING STATE
            ========================================= */

            player.aiming =
                Boolean(
                    data.aiming
                );


            /* =========================================
               BROADCAST
            ========================================= */

            this.broadcast({

                type:
                    "playerUpdate",

                player:
                    player

            });


            return;
        }
    }


    /* =================================================
       PLAYER DISCONNECTED
    ================================================= */

    webSocketClose(ws) {

        this.removePlayer(ws);
    }


    webSocketError(ws) {

        this.removePlayer(ws);
    }


    /* =================================================
       REMOVE PLAYER
    ================================================= */

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


        /* Tell everyone */

        this.broadcast({

            type:
                "playerLeft",

            id:
                playerId
        });
    }


    /* =================================================
       BROADCAST
    ================================================= */

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

                    /* Ignore closed sockets */

                }
            }
        }
    }
}
