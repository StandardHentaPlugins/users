import Sequelize from 'sequelize';
import Henta from 'henta';
import Emittery from 'emittery';
import initDefaultMethods from './defaultMethods';

import BotBridge from './bridges/bot';
import BotcmdBridge from './bridges/botcmd';
import HentadminBridge from './bridges/hentadmin';

class User extends Sequelize.Model {
  [x: string]: any;
};

export default class UsersPlugin {
  henta: Henta;
  usersPrototype = {};
  userGroups = new Set<any>();
  cache = new Map<number, User>();
  bridges: Array<any>;
  User = User;
  userModel = {
    vkId: Sequelize.INTEGER,
    firstName: Sequelize.STRING,
    lastName: Sequelize.STRING
  };

  emitter = new Emittery();
  on = this.emitter.on.bind(this.emitter);
  emit = this.emitter.emit.bind(this.emitter);

  constructor(henta: Henta) {
    this.henta = henta;
  }

  preInit(henta) {
    this.bridges = henta.pluginManager.useBridges([
      { plugin: 'common/bot', class: BotBridge },
      { plugin: 'common/botcmd', class: BotcmdBridge },
      { plugin: 'common/hentadmin', class: HentadminBridge }
    ]);
  }

  init(henta: Henta) {
    initDefaultMethods(henta);
  }

  async preStart(henta: Henta) {
    const dbPlugin = henta.getPlugin('common/db');
    // TODO: dbPlugin.init
    this.User = dbPlugin.define('user', this.userModel, { timestamps: false });
    dbPlugin.applySaveCenter(this.User.prototype);
    await dbPlugin.safeSync(this.User);

    Object.assign(this.User.prototype, this.usersPrototype);
  }

  /**
    Получить пользователя по VkId.

    @param vkId - ID пользователя ВКонтакте.
    @return Экземпляр пользователя.
  */
  async get(vkId: number): Promise<User> {
    const cachedUser = this.cache.get(vkId);
    const user = cachedUser
      || await this.User.findOne({ where: { vkId } });

    if (user && !cachedUser) {
      this.applyMethodGroups(user);
      this.cache.set(vkId, user);
    }

    return user;
  }

  /**
    Получить пользователя или создать нового по VkId.

    @param vkId - ID пользователя ВКонтакте.
    @return Экземпляр пользователя.
  */
  async getOrCreate(vkId: number): Promise<User> {
    return await this.get(vkId) || this.create(vkId);
  }

  /**
    Получить информацию из VK API

    @param vkId - ID пользователя/паблика
    @return Информация
  */
  async getInfo(vkId: number) {
    if (vkId < 0) {
      const [vkGroup] = await this.henta.vk.api.groups.getById({ group_id: (-vkId).toString() });
      return { vkId, firstName: vkGroup.name, lastName: '' };
    }

    const [vkUser] = await this.henta.vk.api.users.get({ user_ids: vkId.toString() });
    return { vkId, firstName: vkUser.first_name, lastName: vkUser.last_name };
  }


  /**
    Создать нового пользователя.

    @param vkId - ID пользователя ВКонтакте.
    @return Экземпляр пользователя.
  */
  async create(vkId: number): Promise<User> {
    const user = new this.User(await this.getInfo(vkId));
    this.applyMethodGroups(user);
    this.cache.set(vkId, user);
    this.emit('create', user);
    this.henta['log'](`Новый пользователь: ${user.firstName} ${user.lastName} (${user.getUrl()})`);

    return user;
  }

  /**
    Применить группы методов к экземпляру.

    @param user - Экземпляр пользователя.
  */
  applyMethodGroups(user: User) {
    for (const group of this.userGroups) {
      const groupMethods = {};

      for (const [name, fn] of group.methods) {
        groupMethods[name] = function (...args) {
          return fn(user, ...args);
        };
      }

      user[group.name] = groupMethods;
    }
  }

  /**
    Получить пользователя по строке.

    @param str - Строка (ссылка, пуш, ИД).
    @return Экземпляр пользователя.
  */
  async resolve(str: string): Promise<User> {
    return this.get(await this.resolveVkId(str));
  }

  /**
    Получить или создать пользователя по строке.

    @param str - Строка (ссылка, пуш, ИД).
    @return Экземпляр пользователя.
  */
 async resolveOrCreate(str: string): Promise<User> {
  return this.getOrCreate(await this.resolveVkId(str));
}

  /**
    Получить VkId по строке.

    @param str - Строка (ссылка, пуш, ИД).
    @return VkId пользователя.
  */
  async resolveVkId(str: string): Promise<number> {
    const res = await this.henta.vk.snippets.resolveResource(str);
    return res.type === 'user' && res.id;
  }

  /**
    Добавить метод пользователя.

    @param name - Имя метода.
    @param fn - Функция метода.
  */
  method(name: string, fn) {
    // eslint-disable-next-line func-names
    this.usersPrototype[name] = function (...args) {
      return fn(this, ...args);
    };
  }

  /**
    Создать группу методов.

    @param groupName - Имя группы.
    @return Группа.
  */
  group(groupName: String) {
    const { userGroups } = this;

    const GroupClass = class {
      name: string;
      methods = new Map<string, any>();

      constructor(name) {
        this.name = name;
      }

      method(name, func) {
        this.methods.set(name, func);
        return this;
      }

      end() {
        userGroups.add(this);
      }
    };

    return new GroupClass(groupName);
  }

  /**
    Добавить поле в ДБ модель User.

    @param name - Имя поля.
    @param data Данные поля.
  */
  field(name: string, data) {
    if (this.userModel[name]) {
      throw Error(`Поле ${name} уже занято`);
    }

    this.userModel[name] = data;
  }
}
