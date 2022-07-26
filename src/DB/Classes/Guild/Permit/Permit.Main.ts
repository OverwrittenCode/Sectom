import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import GuildPermitCommand from "./Permit.Command";
import GuildPermitRoles from "./Permit.Roles";

export default class GuildPermit
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.Permit.Main
{
  @prop({ type: GuildPermitRoles })
  public roles?: mongoose.Types.DocumentArray<GuildPermitRoles>;

  @prop({ type: GuildPermitCommand })
  public commands?: mongoose.Types.DocumentArray<GuildPermitCommand>;
}
