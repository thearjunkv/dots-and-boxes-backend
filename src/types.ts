export type GameState = {
	roomId: string;
	gameStarted: boolean;
	nextMove: string;
	gridSize: string;
	host: string;
	players: {
		playerId: string;
		playerName: string;
		isConnected: boolean;
	}[];
};

export type SavedGameProgress = {
	selectedLines: [string, string][];
	capturedBoxes: [string, string][];
};
