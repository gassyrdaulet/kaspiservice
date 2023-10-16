import TelegramApi from "node-telegram-bot-api";
import fs from "fs/promises";
import config from "config";
import { getOrders, sendCode } from "./API/OrderService.js";
import moment from "moment";

const { token } = config.get("config");
const menu = [{ command: "/start", description: "Запустить бота" }];

let dontBother = [];
export const bot = new TelegramApi(token, { polling: true });
bot.setMyCommands(menu);

setInterval(() => {
  dontBother = [];
  console.log("Очищение", dontBother, moment().format("DD.MM HH:mm:ss"));
}, 900000);

const removeFromDontBother = (telegram_id) => {
  try {
    dontBother = dontBother.filter((id) => id !== telegram_id);
    console.log(dontBother);
    return true;
  } catch {
    return true;
  }
};

const addToNotBother = (telegram_id) => {
  try {
    dontBother.push(telegram_id);
    console.log(dontBother);
    return true;
  } catch {
    return true;
  }
};

const checkForBother = (telegram_id) => {
  try {
    for (let id of dontBother) {
      if (telegram_id === id) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
};

const checkForAuth = async (telegram_id) => {
  try {
    const users = await JSON.parse(await fs.readFile("./users.json"));
    for (let user of users) {
      if (user.telegram_id === telegram_id) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
};

const registration = async (telegram_id, name, password) => {
  try {
    const organizations = await JSON.parse(
      await fs.readFile("./organizations.json")
    );
    console.log(telegram_id, name, password);
    const users = await JSON.parse(await fs.readFile("./users.json"));
    for (let organization of organizations) {
      if (organization.password === password) {
        const filteredUsers = users.filter(
          (user) => user.telegram_id !== telegram_id
        );
        filteredUsers.push({
          telegram_id,
          name,
          organization: organization.id,
        });
        await fs.writeFile("./users.json", JSON.stringify(filteredUsers));
        return true;
      }
    }
    return false;
  } catch (e) {
    console.log(e);
    return false;
  }
};

const quitTheStore = async (telegram_id) => {
  try {
    const users = await JSON.parse(await fs.readFile("./users.json"));
    const filteredUsers = users.filter(
      (user) => user.telegram_id !== telegram_id
    );

    await fs.writeFile("./users.json", JSON.stringify(filteredUsers));
    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
};

const getApiToken = async (telegram_id, storeId) => {
  try {
    const organizations = await JSON.parse(
      await fs.readFile("./organizations.json")
    );
    const users = await JSON.parse(await fs.readFile("./users.json"));
    for (let user of users) {
      if (user.telegram_id === telegram_id) {
        for (let organization of organizations) {
          if (organization.id === user.organization) {
            for (let store of organization.stores) {
              if (store.id === storeId) {
                return store.api_token;
              }
            }
            return "";
          }
          return "";
        }
        return "";
      }
    }
    return "";
  } catch (e) {
    console.log(e);
    return "";
  }
};

const getStores = async (telegram_id) => {
  try {
    const organizations = await JSON.parse(
      await fs.readFile("./organizations.json")
    );
    const users = await JSON.parse(await fs.readFile("./users.json"));
    for (let user of users) {
      if (user.telegram_id === telegram_id) {
        for (let organization of organizations) {
          if (organization.id === user.organization) {
            return organization.stores;
          }
          return false;
        }
        return false;
      }
    }
    return false;
  } catch (e) {
    console.log(e);
    return false;
  }
};

try {
  (async function start() {
    console.log(
      "\x1b[32m%s\x1b[0m",
      `\nKaspiService Бот запущен... ${moment().format("DD.MM HH:mm")}`
    );
    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      try {
        const fromWho = msg.from.id;
        const text = msg.text;
        const isAuth = await checkForAuth(fromWho);
        const bother = checkForBother(fromWho);
        if (!isAuth && !msg.reply_to_message && bother) {
          await bot.sendMessage(
            chatId,
            "Ошибка! Вы не зарегистрированы! Введите секретный код для регистрации. Спросите его у Владельца магазина."
          );
          addToNotBother(fromWho);
          bot.once("message", async (msg) => {
            const success = await registration(
              fromWho,
              msg.from.first_name,
              msg.text
            );
            removeFromDontBother(fromWho);
            if (success) {
              await bot.sendMessage(chatId, "Вы успешно зарегистрировались!");
              return;
            } else {
              await bot.sendMessage(chatId, "Не удалось зарегистрироваться!");
              return;
            }
          });
          return;
        }
        if (!isAuth) {
          return;
        }
        if (
          text === "Удалить регистрацию🚪" &&
          !msg.reply_to_message &&
          bother
        ) {
          const messageForDelete = await bot.sendMessage(
            chatId,
            "Вы уверены что хотите удалить регистрацию?"
          );
          await bot.editMessageReplyMarkup(
            {
              inline_keyboard: [
                [
                  {
                    text: `Нет`,
                    callback_data: `n ${messageForDelete.message_id}`,
                  },
                  {
                    text: `Да`,
                    callback_data: `d ${fromWho} ${messageForDelete.message_id}`,
                  },
                ],
              ],
            },
            {
              chat_id: chatId,
              message_id: messageForDelete.message_id,
            }
          );
        }
        if (text === "/start" && !msg.reply_to_message && bother) {
          await bot.sendMessage(chatId, "Добро пожаловать в KaspiServiceBot!", {
            reply_markup: JSON.stringify({
              keyboard: [
                [{ text: "Показать магазины📋" }],
                [{ text: "Удалить регистрацию🚪" }],
              ],
              resizeKeyboard: true,
            }),
          });
          return;
        }
        if (text === "Показать магазины📋" && !msg.reply_to_message && bother) {
          const stores = await getStores(fromWho);
          if (!stores) {
            return bot.sendMessage(
              chatId,
              "Ошибка при получении списка магазинов!"
            );
          }
          const messageForDelete = await bot.sendMessage(
            chatId,
            "Список всех магазинов:"
          );
          await bot.editMessageReplyMarkup(
            {
              inline_keyboard: stores.map((store) => {
                return [
                  {
                    text: `${store.name}`,
                    callback_data: `s ${store.id} ${fromWho} ${messageForDelete.message_id}`,
                  },
                ];
              }),
            },
            {
              chat_id: chatId,
              message_id: messageForDelete.message_id,
            }
          );
          return;
        }
      } catch (e) {
        console.log(e.message);
        await bot.sendMessage(chatId, "Ошибка! Пожалуйста попробуйте позднее.");
      }
    });

    bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id;
      const queryId = query.id;
      const data = query.data;
      if (data.startsWith("s ")) {
        try {
          const [_, storeId, fromWho, deleteMessageId] = data.split(" ");
          const api_token = await getApiToken(parseInt(fromWho), storeId);
          bot.deleteMessage(chatId, deleteMessageId);
          const orders = await getOrders(api_token);
          if (orders.length === 0) {
            await bot.answerCallbackQuery(queryId, {
              text: "Нет заказов.",
            });
            await bot.sendMessage(
              chatId,
              "На данный момент у этого магазина пока нет никаких заказов."
            );
            return;
          }
          await bot.answerCallbackQuery(queryId, {
            text: "Магазин выбран.",
          });
          const messageForDelete = await bot.sendMessage(
            chatId,
            "Выберите заказ:"
          );
          await bot.editMessageReplyMarkup(
            {
              inline_keyboard: orders.map((order) => {
                const callback_data = `o ${order.id} ${storeId} ${fromWho} ${messageForDelete.message_id}`;
                return [
                  {
                    text: `${order.attributes.deliveryAddress.formattedAddress}`,
                    callback_data,
                  },
                ];
              }),
            },
            {
              chat_id: chatId,
              message_id: messageForDelete.message_id,
            }
          );
        } catch (e) {
          console.log(e);
          await bot.answerCallbackQuery(queryId, {
            text: "Ошибка при получении заказов магазина.",
          });
        }
      }
      if (data.startsWith("n ")) {
        const [_, deleteMessageId] = data.split(" ");
        bot.deleteMessage(chatId, deleteMessageId);
        await bot.answerCallbackQuery(queryId, {
          text: "Ну и правильно...",
        });
      }
      if (data.startsWith("d ")) {
        const [_, fromWho, deleteMessageId] = data.split(" ");
        const result = await quitTheStore(parseInt(fromWho));
        if (!result) {
          await bot.answerCallbackQuery(queryId, {
            text: "Не удалось удалить регистрацию!",
          });
          return bot.deleteMessage(chatId, deleteMessageId);
        }
        await bot.answerCallbackQuery(queryId, {
          text: "Регистрация успешно удалена...",
        });
        bot.sendMessage(chatId, "Регистрация успешно удалена!");
        bot.deleteMessage(chatId, deleteMessageId);
      }
      if (data.startsWith("o ")) {
        try {
          const [_, orderId, storeId, fromWho, deleteMessageId] =
            data.split(" ");
          const api_token = await getApiToken(parseInt(fromWho), storeId);
          const response = await sendCode(api_token, orderId, false);
          if (!response) {
            return bot.answerCallbackQuery(queryId, {
              text: `Ошибка! Не удалось отправить код.`,
            });
          }
          await bot.answerCallbackQuery(queryId, {
            text: `Код успешно отправлен.`,
          });
          bot.deleteMessage(chatId, deleteMessageId);
          bot.sendMessage(chatId, "Введите код который пришел заказчику:");
          addToNotBother(parseInt(fromWho));
          bot.once("message", async (msg) => {
            try {
              const response = await sendCode(
                api_token,
                orderId,
                true,
                msg.text
              );
              removeFromDontBother(parseInt(fromWho));
              if (!response) {
                return bot.sendMessage(
                  chatId,
                  `Ошибка! Кажется неверный код...`
                );
              }
              console.log(
                `${orderId} Заказ успешно выдан. ${moment().format(
                  "DD.MM HH:mm"
                )}`
              );
              await bot.sendMessage(
                chatId,
                "Код абсолютно верен! Заказ успешно выдан."
              );
            } catch (e) {
              console.log(e.message);
              await bot.sendMessage(
                chatId,
                "Ошибка при отправке кода!\n" +
                  (e.response?.data?.errors
                    ? e.response?.data.errors[0].title
                    : e.message)
              );
            }
          });
        } catch (e) {
          console.log(e.message);
          await bot.answerCallbackQuery(queryId, {
            text: "Возникла ошибка!\n",
          });
        }
      }
    });
  })();
} catch (e) {
  console.log(e.message);
  console.log(
    "\x1b[31m%s\x1b[0m",
    `Бот поломался... ${new Date().toLocaleString()}`
  );
  console.log("Перезапускаем бота...");
  start();
}
