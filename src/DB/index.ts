import { Base as IBase } from "@typegoose/typegoose/lib/defaultClasses";

import Base_AccessGate from "./Classes/Base/Access/Access.Gate";
import Base_AccessProperties from "./Classes/Base/Access/Access.Properties";
import Base_DataLog from "./Classes/Base/Base.DataLog";
import Base_UpdateLog from "./Classes/Base/Base.UpdateLog";
import Base_Message from "./Classes/Message/Message.Main";

import Guild_Config from "./Classes/Guild/Guild.Config";

import Trigger_Main from "./Classes/Triggers/Triggers.Main";

import mongoose from "mongoose";

namespace CBase {
  export const DataLog = Base_DataLog;
  export const Message = Base_Message;
  export const UpdateLog = Base_UpdateLog ;
  export namespace Access {
    export const Properties = Base_AccessProperties;
    export const Gate = Base_AccessGate;
  }
}

namespace NClasses {
  export import Base = CBase;
  export const Guild = Guild_Config;
  export const Trigger = Trigger_Main;
}

namespace NInterfaces {
  export namespace Base {
    export namespace Access {
      export interface Properties extends DataLog {
        staff?: mongoose.Types.Array<string>;
        channels?: mongoose.Types.Array<string>;
        roles?: mongoose.Types.Array<string>;
        users?: mongoose.Types.Array<string>;
      }
      export interface Gate extends DataLog {
        blacklist?: Properties;
        whitelist?: Properties;
      }
    }

    export interface UpdateLog {
      readonly userID: string;

      userTag: string;

      userAvatar?: string;

      reason?: string;
    } 

 

    export interface DataLog extends Partial<IBase<string>> {
      updatedBy?: UpdateLog;
  
    }
  }

  export namespace Message {
    export namespace Embed {
      export interface Footer extends Base.DataLog {
        text: string;
        icon_url?: string;
      }
      export interface Image extends Base.DataLog {
        url: string;
        height?: number;
        width?: number;
      }
      export interface Thumbnail extends Image {}
      export interface Video extends Image {}
      export interface Author extends Base.DataLog {
        name: string;
        url?: string;
        icon_url?: string;
      }
      export interface Field extends Base.DataLog {
        name: string;
        value: string;
        inline?: boolean;
      }
      export interface Main extends Base.DataLog {
        title?: string;
        description?: string;
        url?: string;
        timestamp?: string;
        color?: number;
        footer?: Footer;
        image?: Image;
        thumbnail?: Thumbnail;
        video?: Video;
        author?: Author;
        fields?: mongoose.Types.DocumentArray<Field>;
      }
    }

    export interface Main extends Base.DataLog {
      attachments?: mongoose.Types.DocumentArray<Embed.Image>;
      content?: string;
      embeds?: mongoose.Types.DocumentArray<Embed.Main>;
    }
  }

  export namespace Trigger {
    export interface Ignored extends Base.DataLog {
      ignoredRoles?: mongoose.Types.Array<string>;
      ignoredChannels?: mongoose.Types.Array<string>;
      ignoredUsers?: mongoose.Types.Array<string>;
    }

    export interface Target extends Base.DataLog {
      targetedRoles?: mongoose.Types.Array<string>;
      targetedChannels?: mongoose.Types.Array<string>;
      targetedUsers?: mongoose.Types.Array<string>;
    }

    export interface Punishment extends Base.DataLog {
      type: `${NEnums.Punishment.TriggerGate}`;
      lengthMS?: number;
      multiplier?: number;
    }

    export interface Main extends Ignored, Target {
      punishment?: Punishment;

      warnThreshold?: number;
    }
  }

  export namespace Guild {
    export namespace Events {
      export interface Gate extends Trigger.Ignored {
        identifier?: string;
      }

      export interface Logging extends Base.DataLog {
        globalOptions?: Gate;
        channelCreate?: Gate;
        channelDelete?: Gate;
        channelPinsUpdate?: Gate;
        channelUpdate?: Gate;
        emojiCreate?: Gate;
        emojiDelete?: Gate;
        emojiUpdate?: Gate;
        guildBanAdd?: Gate;
        guildBanRemove?: Gate;
        guildMemberAdd?: Gate;
        guildMemberRemove?: Gate;
        guildMemberUpdate?: Gate;
        guildUpdate?: Gate;
        inviteCreate?: Gate;
        inviteDelete?: Gate;
        messageDelete?: Gate;
        messageReactionRemoveAll?: Gate;
        messageReactionRemoveEmoji?: Gate;
        messageDeleteBulk?: Gate;
        messageUpdate?: Gate;
        roleCreate?: Gate;
        roleDelete?: Gate;
        roleUpdate?: Gate;
        threadCreate?: Gate;
        threadDelete?: Gate;
        threadListSync?: Gate;
        threadMemberUpdate?: Gate;
        threadMembersUpdate?: Gate;
        threadUpdate?: Gate;
        voiceStateUpdate?: Gate;
        webhookUpdate?: Gate;
        stageInstanceCreate?: Gate;
        stageInstanceUpdate?: Gate;
        stageInstanceDelete?: Gate;
        stickerCreate?: Gate;
        stickerDelete?: Gate;
        stickerUpdate?: Gate;
        guildScheduledEventCreate?: Gate;
        guildScheduledEventUpdate?: Gate;
        guildScheduledEventDelete?: Gate;
        guildScheduledEventUserAdd?: Gate;
        guildScheduledEventUserRemove?: Gate;
      }
      export interface Main extends Base.DataLog {
        events?: Logging;
      }
    }

    export namespace Tickets {
      export interface Config extends Base.Access.Gate {
        welcomeMessage?: Message.Main;
        closingMessage?: Message.Main;
        /** The message to DM the author of the ticket when the ticket closes */
        directMessage?: Message.Main;
        closingTime?: number;
        closingPermission?: `${NEnums.Shared.ViewerType}`;
        cooldown?: number;
      }
      export interface Global extends Config {
        /** The maximum number of tickets that can be created on the server. */
        globalStorageCapicity?: number;
        globalUserCreationLimit?: number;
      }
      export interface Panel extends Config {
        name: string;
        storageCapacity?: number;
        userCreationLimit?: number;
      }
      export interface Main extends Base.DataLog {
        globalOptions?: Global;
        panelOptions?: mongoose.Types.DocumentArray<Panel>;
      }
    }

    export namespace Permit {
      export interface Roles extends Base.DataLog {
        muted?: string;
        member?: string;
        mods?: mongoose.Types.Array<string>;
        admins?: mongoose.Types.Array<string>;
      }
      export interface Command extends Base.Access.Gate {
        name: string;
      }
      export interface Main extends Base.DataLog {
        roles?: mongoose.Types.DocumentArray<Roles>;
        commands?: mongoose.Types.DocumentArray<Command>;
      }
    }

    export namespace Suggestions {
      export interface Main extends Base.Access.Gate {
        identifier: string;
        approvalChannel?: string;
        implimentedChannel?: string;
        rejectionChannel?: string;
        editPermission?: `${NEnums.Shared.ViewerType}`;
        cooldown?: number;
      }
    }

    export namespace AutoMod {
      export interface Global extends Trigger.Main {
        identifier?: string;
      }

      export interface Main extends Base.DataLog {
        globalOptions?: Global;

        spam?: Trigger.Main;

        massAttachment?: Trigger.Main;

        massMention?: Trigger.Main;

        massEmoji?: Trigger.Main;

        discordInvite?: Trigger.Main;
      }
    }

    export interface Config extends Base.DataLog {
      readonly identifier: string;
      autoRoles?: mongoose.Types.Array<string>;
      disabledModules?: mongoose.Types.Array<string>;
      logging?: Events.Main;
      automod?: AutoMod.Main;
      tickets?: Tickets.Main;
    }
  }

  export namespace Moderation {
    export interface Cases extends Base.DataLog {
      readonly guildID: string;
      readonly caseID: string;
      readonly type?: `${NEnums.Punishment.Type}`;
      targetedAt: Base.UpdateLog;
      endsAt?: Date;
      ended?: boolean;
    }
  };

  
}

namespace NEnums {
  export namespace Punishment {
    export enum Moderation {
      modnick = `MODNICK`,
      warn = `WARN`,
      mute = `MUTE`,
      kick = `KICK`,
      ban = `BAN`,
    }

    export enum Type {
      manual = "MANUAL",
      auto = "AUTO",
    }

    export enum TriggerGate {
      mute = `MUTE`,
      kick = `KICK`,
      ban = `BAN`,
    }
  }

  export namespace Shared {
    export enum ViewerType {
      author = `AUTHOR`,
      staff = `STAFF`,
    }
  }
}

export namespace Namespaces {
  export import Classes = NClasses ;
  export import Interfaces = NInterfaces;
  export import Enums = NEnums;
}
