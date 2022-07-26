import { prop } from "@typegoose/typegoose";
import { Namespaces } from "@DB/index";
import TriggerMain from "../../Triggers/Triggers.Main";
import GuildAutoModGlobal from "./AutoMod.Global";

export default class GuildAutoModMain
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.AutoMod.Main
{
  @prop({ type: GuildAutoModGlobal })
  public globalOptions?: GuildAutoModGlobal;

  @prop({ type: TriggerMain })
  public spam?: TriggerMain;

  @prop({ type: TriggerMain })
  public massAttachment?: TriggerMain;

  @prop({ type: TriggerMain })
  public massMention?: TriggerMain;

  @prop({ type: TriggerMain })
  public massEmoji?: TriggerMain;

  @prop({ type: TriggerMain })
  public discordInvite?: TriggerMain;
}
