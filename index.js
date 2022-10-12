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

const config = JSON.parse(
  await fs.promises.readFile(new URL("./config/config.json", import.meta.url))
);
const { token, replyTimeout } = config;
export const bot = new TelegramApi(token, { polling: true });
const removeReplyListener = (id) => {
  bot.removeReplyListener(id);
};
bot.setMyCommands(authorizedMenu);

try {
  (async function start() {
    console.log("Bot started.");
    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const fromWho = msg.from.id;
      const text = msg.text;
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
      if (text.startsWith("/delete store") && fromWho === 767355250) {
        const words = text.split(" ");
        await conn.query(`DELETE FROM stores WHERE id = "${words[2]}"`);
        await bot.sendMessage(
          chatId,
          "Store with ID = " + words[2] + " deleted."
        );
        return;
      }
      if (text === "/start") {
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
            return `[${index}] 🔶 ${order.attributes.deliveryAddress.formattedAddress} 🔶 ${order.attributes.customer.cellPhone}`;
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
              "Выбери заказ: Напиши номер заказа или номер заказа вместе с кодом через пробел.\n\n" +
                answer,
              forceReply
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
                        await sendCode(
                          api_token,
                          orders[key].id,
                          true,
                          parseInt(code)
                        );
                        await bot.sendMessage(
                          chatId,
                          "Код абсолютно верен! Заказ успешно выдан."
                        );
                        return;
                      } catch (e) {
                        await bot.sendMessage(
                          chatId,
                          "Ошибка! Кажется код не верен...\n" +
                            (e.response.data?.errors
                              ? e.response.data.errors[0].title
                              : e.message)
                        );
                        return;
                      }
                    }
                    console.log(code);
                    await sendCode(api_token, orders[key].id);
                    await bot
                      .sendMessage(
                        msg2.chat.id,
                        "Код успешно отправлен и в скором времени дойдет до покупателя. Чтобы подтвердить код, просто ответьте на это сообщение.",
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
                                parseInt(msg4.text)
                              );
                              await bot.sendMessage(
                                msg4.chat.id,
                                "Код абсолютно верен! Заказ успешно выдан."
                              );
                            } catch (e) {
                              await bot.sendMessage(
                                msg4.chat.id,
                                "Ошибка! Кажется код не верен...\n" +
                                  (e.response.data?.errors
                                    ? e.response.data.errors[0].title
                                    : e.message)
                              );
                            }
                          }
                        );
                        setTimeout(
                          removeReplyListener,
                          replyTimeout,
                          replylistenerid
                        );
                      });
                  } catch (e) {
                    await bot.sendMessage(
                      msg2.chat.id,
                      "Ошибка! Неправильный номер заказа или возможно вы уже недавно отправляли код. Попробуйте еще раз немного позднее.\n" +
                        (e.response.data?.errors
                          ? e.response.data.errors[0].title
                          : e.message)
                    );
                  }
                }
              );
              setTimeout(removeReplyListener, replyTimeout, replylistenerid);
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
