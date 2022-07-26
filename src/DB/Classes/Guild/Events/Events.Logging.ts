import { prop } from "@typegoose/typegoose";
import { Namespaces } from "@DB/index";

import GuildEventsGate from "./Events.Gate";
import Events = Namespaces.Interfaces.Guild.Events;

export default class GuildEventsLogging
  extends Namespaces.Classes.Base.DataLog
  implements Events.Logging
{
  @prop({ type: GuildEventsGate })
  public globalOptions: Events.Gate;

  @prop({ type: GuildEventsGate })
  public channelCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public channelDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public channelPinsUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public channelUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public emojiCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public emojiDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public emojiUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildBanAdd: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildBanRemove: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildMemberAdd: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildMemberRemove: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildMemberUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public inviteCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public inviteDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public messageDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public messageReactionRemoveAll: Events.Gate;

  @prop({ type: GuildEventsGate })
  public messageReactionRemoveEmoji: Events.Gate;

  @prop({ type: GuildEventsGate })
  public messageDeleteBulk: Events.Gate;

  @prop({ type: GuildEventsGate })
  public messageUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public roleCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public roleDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public roleUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public threadCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public threadDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public threadListSync: Events.Gate;

  @prop({ type: GuildEventsGate })
  public threadMemberUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public threadMembersUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public threadUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public userUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public voiceStateUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public webhookUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public stageInstanceCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public stageInstanceUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public stageInstanceDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public stickerCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public stickerDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public stickerUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildScheduledEventCreate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildScheduledEventUpdate: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildScheduledEventDelete: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildScheduledEventUserAdd: Events.Gate;

  @prop({ type: GuildEventsGate })
  public guildScheduledEventUserRemove: Events.Gate;
}
