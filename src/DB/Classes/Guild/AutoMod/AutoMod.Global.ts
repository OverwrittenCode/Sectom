import { prop } from "@typegoose/typegoose";
import { Namespaces } from "@DB/index";
import TriggerMain from "../../Triggers/Triggers.Main";

export default class GuildAutoModGlobal
  extends TriggerMain
  implements Namespaces.Interfaces.Guild.AutoMod.Global
{
  @prop()
  public identifier: string;
}
