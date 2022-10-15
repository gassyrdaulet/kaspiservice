import TelegramApi from "node-telegram-bot-api";
import mysql from "mysql2/promise";
import fs from "fs";
import { getOrders, sendCode } from "./API/OrderService.js";
import {
  authorizedMenu,
  forceReply,
} from "./MenuAndOptions/KeyboardOptions.js";
import { start } from "repl";
export const conn = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  database: "kaspiservice",
  port: "3306",
  password: "",
});
const adminId = 767355250;
const original = "Zeveta1559!";
const config = JSON.parse(
  await fs.promises.readFile(new URL("./config/config.json", import.meta.url))
);
const { token, replyTimeout } = config;
export const bot = new TelegramApi(token, { polling: true });
const removeReplyListener = (id) => {
  bot.removeReplyListener(id);
};
bot.setMyCommands(authorizedMenu);
const checkForAuth = async (id) => {
  try {
    const name = (
      await conn.query("SELECT name FROM users WHERE telegram_id = " + id)
    )[0];
    if (name.length === 0) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};
const registration = async (password, telegram_id, name) => {
  try {
    if (password === original) {
      await conn.query("INSERT INTO users SET ?", { telegram_id, name });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

try {
  (async function start() {
    console.log("Bot started.");
    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const fromWho = msg.from.id;
      const text = msg.text;
      const isAuth = await checkForAuth(fromWho);
      if (!isAuth && !msg.reply_to_message) {
        await bot
          .sendMessage(
            chatId,
            "Ошибка! Вы не зарегистрированы! Введите секретный пароль для регистрации. Спросите его у Гасыра.",
            forceReply
          )
          .then(async (msg2) => {
            const replylistenerid = bot.onReplyToMessage(
              msg2.chat.id,
              msg2.message_id,
              async (msg3) => {
                removeReplyListener(replylistenerid);
                const success = await registration(
                  msg3.text,
                  fromWho,
                  msg.from.first_name
                );
                if (success) {
                  await bot.sendMessage(
                    chatId,
                    "Вы успешно зарегистрировались!"
                  );
                  return;
                } else {
                  await bot.sendMessage(
                    chatId,
                    "Не удалось зарегистрироваться!"
                  );
                  return;
                }
              }
            );
            setTimeout(removeReplyListener, 30 * 1000, replylistenerid);
          });
        return;
      }
      if (!isAuth) {
        return;
      }
      bot.setMyCommands(authorizedMenu);
      if (text.startsWith("/add store") && fromWho === 767355250) {
        const words = text.split(" ");
        await conn.query(`INSERT INTO stores SET ?`, {
          store_name: words[2],
          api_token: words[3],
          manager: words[4],
        });
        await bot.sendMessage(
          chatId,
          "Store with name = `" +
            words[2] +
            "` successfully added to the database."
        );
        return;
      }
      if (text.startsWith("/delete store") && fromWho === adminId) {
        const words = text.split(" ");
        await conn.query(`DELETE FROM stores WHERE id = "${words[2]}"`);
        await bot.sendMessage(
          chatId,
          "Store with ID = " + words[2] + " deleted."
        );
        return;
      }
      if (text === "/start" && !msg.reply_to_message) {
        const stores = (await conn.query("SELECT * FROM stores"))[0];
        const buttons = stores.map((store) => {
          return [
            {
              text: `[${store.id}] ${store.store_name} - ${store.manager}`,
              callback_data: `use ${store.id} ${store.api_token}`,
            },
          ];
        });
        await bot.sendMessage(chatId, "Список всех магазинов:", {
          reply_markup: JSON.stringify({
            inline_keyboard: buttons,
          }),
        });
        return;
      }
    });
    bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id;
      const fromWho = query.message.from.id;
      const queryId = query.id;
      const text = query.message.text;
      const data = query.data;
      if (data.startsWith("use")) {
        try {
          const [use, storeId, api_token] = data.split(" ");
          const orders = await getOrders(api_token);
          const text = orders.map((order, index) => {
            return `[${index}] 🔶 ${order.attributes.deliveryAddress.formattedAddress} 🔶 <a href="tel:+7768290879">${order.attributes.customer.cellPhone}</a>`;
          });
          const answer = text.join("\n\n");
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
          await bot
            .sendMessage(
              chatId,
              `Выбери заказ: Напиши номер заказа или номер заказа вместе с кодом через пробел. Сообщение принимает ответ в течение ${
                parseInt(replyTimeout) / 60000
              } минут.\n\n` + answer,
              { ...forceReply, parse_mode: "HTML" }
            )
            .then(async (msg2) => {
              await bot.answerCallbackQuery(queryId, {
                text: "Магазин выбран. ID: " + storeId,
              });
              const replylistenerid = bot.onReplyToMessage(
                msg2.chat.id,
                msg2.message_id,
                async (msg) => {
                  try {
                    bot.removeReplyListener(replylistenerid);
                    const key = parseInt(msg.text.split(" ")[0]);
                    const code = msg.text.split(" ")[1];
                    if (code) {
                      try {
                        await sendCode(api_token, orders[key].id, true, code);
                        await bot.sendMessage(
                          chatId,
                          "Код абсолютно верен! Заказ успешно выдан."
                        );
                        return;
                      } catch (e) {
                        await bot.sendMessage(
                          chatId,
                          "Ошибка! Кажется код не верен...\n" +
                            (e.response?.data?.errorbs
                              ? e.response?.data.errors[0].title
                              : e.message)
                        );
                        return;
                      }
                    }
                    await sendCode(api_token, orders[key].id);
                    await bot
                      .sendMessage(
                        msg2.chat.id,
                        `Код успешно отправлен и в скором времени дойдет до покупателя. Чтобы подтвердить код, просто ответьте на это сообщение. В течение ${
                          parseInt(replyTimeout) / 60000
                        } минут!`,
                        forceReply
                      )
                      .then((msg3) => {
                        const replylistenerid = bot.onReplyToMessage(
                          msg3.chat.id,
                          msg3.message_id,
                          async (msg4) => {
                            try {
                              bot.removeReplyListener(replylistenerid);
                              await sendCode(
                                api_token,
                                orders[key].id,
                                true,
                                msg4.text
                              );
                              await bot.sendMessage(
                                msg4.chat.id,
                                "Код абсолютно верен! Заказ успешно выдан."
                              );
                            } catch (e) {
                              await bot.sendMessage(
                                msg4.chat.id,
                                "Ошибка! Кажется код не верен...\n" +
                                  (e.response?.data?.errors
                                    ? e.response?.data.errors[0].title
                                    : e.message)
                              );
                            }
                          }
                        );
                        setTimeout(
                          removeReplyListener,
                          parseInt(replyTimeout),
                          replylistenerid
                        );
                      });
                  } catch (e) {
                    await bot.sendMessage(
                      msg2.chat.id,
                      "Ошибка! Неправильный номер заказа или возможно вы уже недавно отправляли код. Попробуйте еще раз немного позднее.\n" +
                        (e.response?.data?.errors
                          ? e.response.data.errors[0].title
                          : e.message)
                    );
                  }
                }
              );
              setTimeout(
                removeReplyListener,
                parseInt(replyTimeout),
                replylistenerid
              );
            });
        } catch (e) {
          await bot.answerCallbackQuery(queryId, {
            text: "Возникла ошибка!\n" + e,
          });
        }
      }
    });
  })();
} catch (e) {
  console.log("Bot crashed");
  start();
}
