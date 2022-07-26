import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";

export default class GuildPermitRoles
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.Permit.Roles
{
  @prop()
  public muted?: string;

  @prop()
  public member?: string;

  @prop({ type: String })
  public mods?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public admins?: mongoose.Types.Array<string>;
}
