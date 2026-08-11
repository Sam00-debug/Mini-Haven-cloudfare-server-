import { DurableObject } from "cloudflare:workers";

export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        if (url.pathname !== "/game") {
            return new Response("Mini Haven Multiplayer");
        }

        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("WebSocket required", {
                status: 426
            });
        }

        const roomName =
            url.searchParams.get("room") || "main";

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
    }


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

        this.players.set(
            playerId,
            {
                id: playerId,
                name: "Player",
                x: 0,
                y: 0,
                color: "#4DA6FF",
                direction: "down",
                moving: false,
                animationTime: 0
            }
        );


        /* Tell client its REAL server ID */

        server.send(
            JSON.stringify({
                type: "welcome",
                id: playerId
            })
        );


        /* Send existing players */

        server.send(
            JSON.stringify({
                type: "players",
                players: [
                    ...this.players.values()
                ]
            })
        );


        /* Tell existing players about newcomer */

        this.broadcast(
            {
                type: "playerJoined",
                player:
                    this.players.get(playerId)
            },
            server
        );


        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }


    webSocketMessage(ws, message) {

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
            this.players.get(playerId);

        if (!player) {
            return;
        }


        /* ===============================
           JOIN / INITIAL PLAYER DATA
        =============================== */

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


            player.moving =
                Boolean(data.moving);


            this.broadcast({
                type: "playerUpdate",
                player
            });

            return;
        }


        /* ===============================
           PLAYER STATE
        =============================== */

        if (
            data.type === "state"
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


            player.moving =
                Boolean(data.moving);


            this.broadcast({
                type: "playerUpdate",
                player
            });

            return;
        }
    }


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
            type: "playerLeft",
            id: playerId
        });
    }


    broadcast(
        data,
        except = null
    ) {

        const message =
            JSON.stringify(data);


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

                    ws.send(message);

                } catch {

                    // Ignore closed sockets

                }
            }
        }
    }
}
