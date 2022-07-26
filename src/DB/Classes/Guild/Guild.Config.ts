import { modelOptions, prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import GuildAutoModMain from "./AutoMod/AutoMod.Main";

import GuildEventsMain from "./Events/Events.Main";
import GuildTickets from "./Tickets/Tickets.Main";

@modelOptions({ schemaOptions: { collection: `guild-config` } })
export default class GuildConfig
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.Config
{
  @prop({ required: true, unique: true, immutable: true })
  public readonly identifier: string;

  @prop({ type: String })
  public autoRoles?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public disabledModules?: mongoose.Types.Array<string>;

  @prop({ type: GuildEventsMain })
  public logging?: GuildEventsMain;

  @prop({ type: GuildAutoModMain })
  public automod?: GuildAutoModMain;

  @prop({ type: GuildTickets })
  public tickets?: GuildTickets;
}
