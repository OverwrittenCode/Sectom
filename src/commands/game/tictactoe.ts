import { Category, EnumChoice, RateLimit, TIME_UNIT } from "@discordx/utilities";
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction
} from "discord.js";
import { Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";

import { MAX_COMPONENT_GRID_SIZE } from "~/constants.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import type { ComputerPlayerFn, GameControllerComponent } from "~/models/framework/controllers/GameController.js";
import { GameController } from "~/models/framework/controllers/GameController.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { APIButtonComponentWithCustomId, APIEmbedField, GuildMember } from "discord.js";

interface MoveScore {
	index: string;
	score: number;
}

enum Teams {
	Naughts = "X",
	Crosses = "O"
}

enum Difficulty {
	Easy = "Easy",
	Medium = "Medium",
	Hard = "Hard",
	"Impossible (When Classic Mode is on)" = "Impossible",
	"Computer Biased Game Matster (Not Allowed For Classic)" = "Computer Biased Game Master"
}

const minGridSize = 3;

const gridSizeChoices = Array.from({ length: MAX_COMPONENT_GRID_SIZE - minGridSize + 1 }, (_, i) => i + minGridSize);

@Discord()
@Category(Enums.CommandCategory.Game)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class TicTacToe {
	@Slash({ dmPermission: false, description: "Play TicTacToe" })
	public async ttt(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild, Enums.CommandSlashOptionTargetFlags.Passive],
			name: "opponent",
			required: false
		})
		opponent: GuildMember | ComputerPlayerFn | undefined,
		@SlashChoice(...GameController.bestOfChoices)
		@SlashOption({
			description: "Play to best of N rounds",
			name: "best_of",
			type: ApplicationCommandOptionType.Number
		})
		rounds: number = 1,
		@SlashOption({
			description: "Win by two points",
			name: "deuce",
			type: ApplicationCommandOptionType.Boolean
		})
		deuce: boolean = true,
		@SlashChoice(...gridSizeChoices)
		@SlashOption({
			description: "Grid size N x N",
			name: "grid_size",
			type: ApplicationCommandOptionType.Number
		})
		N: number = 3,
		@SlashChoice(...EnumChoice(Enums.GameMode))
		@SlashOption({
			description: "The game mode to apply. All special rules happen randomly",
			name: "game_mode",
			type: ApplicationCommandOptionType.String
		})
		gameMode: Enums.GameMode = Enums.GameMode.Classic,
		@SlashChoice(...EnumChoice(Difficulty))
		@SlashOption({
			description: "The bot difficulty. Default is medium. This is ignored if opponent is a real player",
			name: "bot_difficulty",
			type: ApplicationCommandOptionType.String
		})
		difficulty: Difficulty = Difficulty.Medium,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const components = Array.from(
			{ length: N },
			(_, row) =>
				new ActionRowBuilder<ButtonBuilder>()
					.addComponents(
						Array.from({ length: N }, (_, column) => {
							const customIdGenerator = InteractionUtils.constructCustomIdGenerator({
								baseID: `${row}_${column}`,
								messageComponentType: Enums.MessageComponentType.Button
							});

							return new ButtonBuilder()
								.setCustomId(customIdGenerator())
								.setStyle(ButtonStyle.Secondary)
								.setLabel(StringUtils.TabCharacter);
						})
					)
					.toJSON() as GameControllerComponent
		);

		const winInARow = N < 5 ? N : 4;

		const winningCombinations: string[][] = [];

		for (let row = 0; row < N; row++) {
			for (let column = 0; column < N; column++) {
				const canFitRow = column <= N - winInARow;
				const canFitColumn = row <= N - winInARow;
				const canFitTLBR = canFitColumn && canFitRow;
				const canFitBLTR = canFitColumn && column >= winInARow - 1;

				if (canFitRow) {
					const rowCombination = [];

					for (let offset = 0; offset < winInARow; offset++) {
						rowCombination.push(`${row}_${column + offset}`);
					}

					winningCombinations.push(rowCombination);
				}

				if (canFitColumn) {
					const columnCombination = [];

					for (let offset = 0; offset < winInARow; offset++) {
						columnCombination.push(`${row + offset}_${column}`);
					}

					winningCombinations.push(columnCombination);
				}

				if (canFitTLBR) {
					const diagonalCombination1 = [];

					for (let offset = 0; offset < winInARow; offset++) {
						diagonalCombination1.push(`${row + offset}_${column + offset}`);
					}

					winningCombinations.push(diagonalCombination1);
				}

				if (canFitBLTR) {
					const diagonalCombination2 = [];

					for (let offset = 0; offset < winInARow; offset++) {
						diagonalCombination2.push(`${row + offset}_${column - offset}`);
					}

					winningCombinations.push(diagonalCombination2);
				}
			}
		}

		const modifiers: APIEmbedField[] = [
			{
				name: "Grid Size",
				value: `${N}x${N}`,
				inline: true
			}
		];

		const regex = new RegExp(`^(\\d+)_(\\d+)\\${StringUtils.CustomIDFIeldBodySeperator}`);

		const getMatrixLocation = (customId: string): [row: number, column: number] => {
			const match = customId.match(regex);

			if (match) {
				const [, row, column] = match.map(Number);

				return [row, column];
			}

			return customId.split("_").map(Number) as [number, number];
		};

		const getAllButtons = (controller: GameController): APIButtonComponentWithCustomId[] =>
			controller.components.flatMap(({ components }) => components);

		const isComputerPlayer = !opponent || (opponent as GuildMember).user.bot;

		if (
			difficulty === Difficulty["Computer Biased Game Matster (Not Allowed For Classic)"] &&
			(gameMode === Enums.GameMode.Classic || !isComputerPlayer)
		) {
			difficulty = Difficulty["Impossible (When Classic Mode is on)"];
		}

		if (isComputerPlayer) {
			modifiers.push({
				name: "Bot Difficulty",
				value: difficulty,
				inline: true
			});

			if (difficulty !== Difficulty.Easy) {
				opponent = (controller): string => {
					const allButtons = getAllButtons(controller);

					const isSwapMove =
						difficulty === Difficulty["Computer Biased Game Matster (Not Allowed For Classic)"] &&
						controller.specialRule === Enums.GameMode["Swap Move"];

					const currentComputerTeam = controller.players.find(
						(player) => player.member.user.bot !== isSwapMove
					)!.team! as Teams;

					const opposingTeam = currentComputerTeam === Teams.Naughts ? Teams.Crosses : Teams.Naughts;

					const MAX: MoveScore = { index: "", score: 1000 };
					const MIN: MoveScore = { index: "", score: -1000 };

					const transpositionTable = new Map<string, MoveScore>();

					const hashBoard = (buttons: APIButtonComponentWithCustomId[]): string => {
						return buttons.map((button) => button.label).join("");
					};

					const quiescenceSearch = (
						buttons: APIButtonComponentWithCustomId[],
						alpha: MoveScore,
						beta: MoveScore,
						player: Teams
					): MoveScore => {
						const standPat = evaluateBoard(buttons, player);

						if (standPat >= beta.score) {
							return { index: "", score: beta.score };
						}

						if (alpha.score < standPat) {
							alpha = { index: "", score: standPat };
						}

						const availableMoves = checkAvailableMoves(buttons);
						for (const move of availableMoves) {
							const [row, column] = getMatrixLocation(move);
							buttons[row * N + column].label = player;

							const score = -quiescenceSearch(
								buttons,
								{ index: "", score: -beta },
								{ index: "", score: -alpha.score },
								player
							).score;

							buttons[row * N + column].label = StringUtils.TabCharacter;

							if (score >= beta.score) {
								return { index: "", score: beta.score };
							}

							if (score > alpha.score) {
								alpha = { index: "", score: score };
							}
						}

						return alpha;
					};

					const minimax = (
						buttons: APIButtonComponentWithCustomId[],
						depth: number,
						player: Teams,
						alpha: MoveScore,
						beta: MoveScore,
						isMaximizing: boolean
					): MoveScore => {
						const boardHash = hashBoard(buttons);
						if (transpositionTable.has(boardHash)) {
							return transpositionTable.get(boardHash)!;
						}

						if (N > 3 && depth >= 5) {
							return quiescenceSearch(buttons, alpha, beta, player);
						}

						const availableMoves = checkAvailableMoves(buttons);

						if (isWinning(buttons, opposingTeam)) {
							return { index: "", score: -100 + depth };
						} else if (isWinning(buttons, currentComputerTeam)) {
							return { index: "", score: 100 - depth };
						} else if (availableMoves.length === 0) {
							return { index: "", score: 0 };
						}

						let bestMove = isMaximizing ? MIN : MAX;

						availableMoves.sort((a, b) => {
							const [rowA, colA] = getMatrixLocation(a);
							const [rowB, colB] = getMatrixLocation(b);
							const center = Math.floor(N / 2);
							const distA = Math.abs(rowA - center) + Math.abs(colA - center);
							const distB = Math.abs(rowB - center) + Math.abs(colB - center);
							return distA - distB;
						});

						for (const move of availableMoves) {
							const [row, column] = getMatrixLocation(move);

							buttons[row * N + column].label = player;

							let result = minimax(
								buttons,
								depth + 1,
								player === currentComputerTeam ? opposingTeam : currentComputerTeam,
								alpha,
								beta,
								!isMaximizing
							);

							const originalButton = controller.components[row].components[column];

							if (
								controller.specialRule === Enums.GameMode.Overrule &&
								originalButton.style !== ButtonStyle.Secondary
							) {
								buttons[row * N + column].label = isSwapMove ? currentComputerTeam : opposingTeam;
							} else {
								buttons[row * N + column].label = StringUtils.TabCharacter;
							}

							result = { ...result, index: move };

							if (isMaximizing) {
								bestMove = result.score > bestMove.score ? result : bestMove;
								alpha = result.score > alpha.score ? result : alpha;
							} else {
								bestMove = result.score < bestMove.score ? result : bestMove;
								beta = result.score < beta.score ? result : beta;
							}

							if (alpha.score >= beta.score) {
								break;
							}
						}

						transpositionTable.set(boardHash, bestMove);
						return bestMove;
					};

					const iterativeDeepening = (
						buttons: APIButtonComponentWithCustomId[],
						player: Teams,
						maxDepth: number,
						timeLimit: number
					): MoveScore => {
						let bestMove = MIN;
						const startTime = Date.now();

						for (let depth = 1; depth <= maxDepth; depth++) {
							const result = minimax(buttons, depth, player, MIN, MAX, true);
							if (Date.now() - startTime > timeLimit) break;
							bestMove = result;
						}

						return bestMove;
					};

					const checkAvailableMoves = (buttons: APIButtonComponentWithCustomId[]): string[] => {
						return buttons
							.filter(
								(button) =>
									!button.disabled &&
									(controller.specialRule === Enums.GameMode.Overrule
										? button.label !== currentComputerTeam
										: button.label === StringUtils.TabCharacter)
							)
							.map((button) => button.custom_id);
					};

					const isWinning = (buttons: APIButtonComponentWithCustomId[], team: Teams): boolean => {
						return winningCombinations.some((combination) =>
							combination.every((pos) => {
								const [row, column] = pos.split("_").map(Number);
								return buttons[row * N + column].label === team;
							})
						);
					};

					const evaluateBoard = (buttons: APIButtonComponentWithCustomId[], team: Teams): number => {
						let score = 0;

						for (let i = 0; i < N; i++) {
							const rows = [i, 0, 0, 1] as const;
							const columns = [0, i, 1, 0] as const;

							score += evaluateLine(buttons, ...rows, N, team);
							score += evaluateLine(buttons, ...columns, N, team);
						}

						const matrixTLBR = [0, 0, 1, 1] as const;
						const matrixBLTR = [0, N - 1, 1, -1] as const;

						score += [
							evaluateLine(buttons, ...matrixTLBR, N, team),
							evaluateLine(buttons, ...matrixBLTR, N, team),
							evaluateTwoWayWins(buttons, team) * 10,
							evaluateTwoWayWins(buttons, opposingTeam) * -15
						].reduce((acc, curr) => acc + curr, 0);

						return score;
					};

					const evaluateLine = (
						buttons: APIButtonComponentWithCustomId[],
						startRow: number,
						startCol: number,
						rowStep: number,
						colStep: number,
						length: number,
						team: Teams
					): number => {
						let score = 0;
						let count = 0;
						let emptyCount = 0;

						for (let i = 0; i < length; i++) {
							const row = startRow + i * rowStep;
							const col = startCol + i * colStep;
							const cell = buttons[row * N + col].label;

							if (cell === team) {
								count++;
							} else if (cell === StringUtils.TabCharacter) {
								emptyCount++;
							} else {
								count = 0;
								emptyCount = 0;
							}

							if (count === winInARow - 1 && emptyCount === 1) {
								score += 5;
							} else if (count === winInARow - 2 && emptyCount === 2) {
								score += 2;
							}
						}

						return score;
					};

					const evaluateTwoWayWins = (buttons: APIButtonComponentWithCustomId[], team: Teams): number => {
						let twoWayWins = 0;

						for (let i = 0; i < N; i++) {
							for (let j = 0; j < N; j++) {
								if (buttons[i * N + j].label === StringUtils.TabCharacter) {
									buttons[i * N + j].label = team;
									let winningMoves = 0;

									const directions = [
										[0, 1], // Right (horizontal)
										[1, 0], // Down (vertical)
										[1, 1], // Diagonal top-left to bottom-right (TLBR)
										[1, -1] // Diagonal bottom-left to top-right (BLTR)
									];

									for (const [dx, dy] of directions) {
										if (checkWinningMove(buttons, i, j, dx, dy, team)) winningMoves++;
									}

									if (winningMoves >= 2) twoWayWins++;
									buttons[i * N + j].label = StringUtils.TabCharacter;
								}
							}
						}

						return twoWayWins;
					};

					const checkWinningMove = (
						buttons: APIButtonComponentWithCustomId[],
						row: number,
						col: number,
						dx: number,
						dy: number,
						team: Teams
					): boolean => {
						let count = 1;

						// Check forward direction
						for (let i = 1; i < winInARow; i++) {
							const newRow = row + i * dx;
							const newCol = col + i * dy;

							if (
								newRow < 0 ||
								newRow >= N ||
								newCol < 0 ||
								newCol >= N ||
								buttons[newRow * N + newCol].label !== team
							) {
								break;
							}

							count++;
						}

						// Check backward direction
						for (let i = 1; i < winInARow; i++) {
							const newRow = row - i * dx;
							const newCol = col - i * dy;

							if (
								newRow < 0 ||
								newRow >= N ||
								newCol < 0 ||
								newCol >= N ||
								buttons[newRow * N + newCol].label !== team
							) {
								break;
							}

							count++;
						}

						return count >= winInARow;
					};

					const winningMove = checkAvailableMoves(allButtons).find((move) => {
						const [row, column] = getMatrixLocation(move);

						allButtons[row * N + column].label = currentComputerTeam;

						const isWin = isWinning(allButtons, currentComputerTeam);

						allButtons[row * N + column].label = StringUtils.TabCharacter;

						return isWin;
					});

					let finalMove: string;

					if (isSwapMove) {
						const { index: worstMove } = minimax(allButtons, 0, currentComputerTeam, MIN, MAX, false);

						finalMove = worstMove;
					} else if (winningMove) {
						finalMove = winningMove;
					} else {
						const { index: bestMove } = iterativeDeepening(allButtons, currentComputerTeam, 10, 1000);
						finalMove = bestMove;

						const randomness =
							difficulty === Difficulty.Hard ? 0.05 : difficulty === Difficulty.Medium ? 0.1 : 0;

						if (
							difficulty !== Difficulty["Impossible (When Classic Mode is on)"] &&
							Math.random() <= randomness
						) {
							const availableMoves = checkAvailableMoves(allButtons);
							finalMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
						}
					}

					const [row, column] = getMatrixLocation(finalMove);

					return controller.components[row].components[column].custom_id;
				};
			}
		}

		const game = new GameController(interaction, components, {
			opponent,
			rounds,
			deuce,
			title: "TicTacToe",
			disableOnClick: true,
			clearBoardOnPoint: true,
			turnBased: true,
			teams: Teams,
			computerBiasedGameMaster:
				difficulty === Difficulty["Computer Biased Game Matster (Not Allowed For Classic)"],
			gameMode,
			modifiers,
			onActionCollect(controller, playerActions) {
				const playerAction = playerActions.first()!;

				const [row, column] = getMatrixLocation(playerAction.customId);

				const button = ButtonBuilder.from(controller.components[row].components[column]);

				button.setLabel(playerAction.profile.team!);

				if (playerAction.profile.team === Teams.Naughts) {
					button.setStyle(ButtonStyle.Danger);
				} else {
					button.setStyle(ButtonStyle.Primary);
				}

				controller.components[row].components[column] = button.toJSON() as APIButtonComponentWithCustomId;

				const allButtons = getAllButtons(controller);
				const allUsedButtons = allButtons.filter((button) => button.label !== StringUtils.TabCharacter);

				if (allUsedButtons.length < N) {
					return;
				}

				const teamData = Object.groupBy(allUsedButtons, (button) => button.label!);

				const teamEntries = ObjectUtils.entries(teamData, { excludeUndefined: true });

				for (const [team, buttons] of teamEntries) {
					const winningCombo = winningCombinations.find((combo) =>
						combo.every((comboId) => buttons.find((button) => button.custom_id.startsWith(comboId)))
					);

					if (winningCombo) {
						const player = controller.players.find((player) => player.team === team)!;

						return controller.setGameStatus(player);
					}
				}

				if (allUsedButtons.length === allButtons.length) {
					return controller.setGameStatus();
				}
			}
		});

		return await game.init();
	}
}
