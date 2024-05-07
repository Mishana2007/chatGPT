const OpenAI = require("openai");
const { Telegraf, Markup } = require("telegraf");
const ExcelJS = require('exceljs');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const writingIndicator = "...✍️"; // Переменная для индикатора написания

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
});

const bot = new Telegraf(process.env["TELEGRAM_TOKEN"]);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('UsersActivity');

const db = new sqlite3.Database('./user.db', (err) => {
    if (err) {
        console.error('Ошибка открытия базы данных:', err.message);
    } else {
        console.log('База данных успешно подключена');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT
        )`, (err) => {
            if (err) {
                console.error('Ошибка создания таблицы пользователей:', err.message);
            } else {
                console.log('Таблица пользователей успешно создана');
            }
        });
    }
});



bot.command('users', async (ctx) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) {
            console.error('Ошибка при получении списка пользователей:', err.message);
            ctx.reply('Произошла ошибка. Пожалуйста, повторите попытку позже.');
        } else {
            if (rows.length === 0) {
                ctx.reply('На данный момент в базе данных нет зарегистрированных пользователей.');
            } else {
                let userList = 'Список пользователей:\n';
                rows.forEach((row) => {
                    userList += `ID: ${row.user_id}, Username: ${row.username}\n`;
                });
                ctx.reply(userList);
            }
        }
    });
});

let usersToday = 0;
let conversationContext = {}; // Переменная для хранения контекста разговора

function sendMessageToBot(chatId, message) {
    return bot.telegram.sendMessage(chatId, message)
        .then(sentMessage => {
            console.log('Сообщение успешно отправлено в бота от лица бота');
            return sentMessage;
        })
        .catch((error) => {
            console.error('Ошибка при отправке сообщения в бота:', error);
        });
}


bot.action('option4', async (ctx) => {
    const serviceInfo = "Данный бот - это прямой доступ к GPT Chat от Open AI. Оферта по ссылке";
    ctx.reply(serviceInfo);
});

bot.action('option3', async (ctx) => {
    const textWithLinkhelper = '[gptman_support](https://t.me/gptman_support)';
    ctx.reply(`Аккаунт с поддержкой ${textWithLinkhelper}`, {parse_mode: "Markdown"} );
});

bot.action('option2', async (ctx) => {
    ctx.reply(`Это инструкция как пользоваться ботом:
1. Нажмите кнопку "Бесплатный бот" в меню.
2. Задайте боту интересующий вас вопрос.
3. Дождитесь ответа бота.
4. Пользуйтесь ботом без ограничений!`);
});

bot.action('option1', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || '';

    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Ошибка при проверке пользователя в базе данных:', err.message);
        } else {
            if (!row) {
                db.run('INSERT INTO users (user_id, username) VALUES (?, ?)', [userId, username], (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении пользователя в базу данных:', err.message);
                    } else {
                        console.log('Пользователь успешно добавлен в базу данных');
                        usersToday++;
                    }
                });
            }
        }
    });

    await ctx.reply('Задай мне вопрос.');

    bot.on('text', async (ctx) => {
        const text = ctx.message?.text;

        try {
            const sentMessage = await sendMessageToBot(ctx.chat.id, writingIndicator);

            const chatCompletion = await openai.chat.completions.create({
                messages: [
                    { role: 'user', content: text },
                    ...conversationContext[ctx.chat.id]?.history || []
                ],
                model: 'gpt-3.5-turbo',
            });

            const response = chatCompletion.choices[0]?.message.content;

            bot.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, null, response);

            conversationContext[ctx.chat.id] = {
                history: [
                    ...(conversationContext[ctx.chat.id]?.history || []),
                    { role: 'user', content: text },
                    { role: 'assistant', content: response }
                ]
            };

            const timestamp = new Date().toISOString();
            sheet.addRow([timestamp, userId, text, response]);
            await workbook.xlsx.writeFile('users_activity.xlsx');
        } catch (error) {
            console.error('Ошибка при обработке запроса GPT:', error);
            ctx.reply('При обработке запроса произошла ошибка. Пожалуйста, повторите попытку позже.');
        }
    });
    
});

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || '';

    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Ошибка при проверке пользователя в базе данных:', err.message);
        } else {
            if (!row) {
                db.run('INSERT INTO users (user_id, username) VALUES (?, ?)', [userId, username], (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении пользователя в базу данных:', err.message);
                    } else {
                        console.log('Пользователь успешно добавлен в базу данных');
                        usersToday++;
                    }
                });
            }
        }
    });

    try {
        const chatMember = await bot.telegram.getChatMember('@naneironkah', ctx.chat.id);

        const username = ctx.chat.first_name

        const textWithLink = '["На нейронках"](https://t.me/naneironkah)';

        if (chatMember && ['member', 'administrator', 'creator'].includes(chatMember.status)) {
            sendMenu(ctx.chat.id);
        } else {
            ctx.reply(`${username} Подпишись на наш канал ${textWithLink}\nПользуйся без ограничений бесплатно!`,{ parse_mode: 'Markdown' }, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Подписаться на канал', url: 'https://t.me/naneironkah' }]
                    ]
                }
            });
        }
    } catch (err) {
        console.error('Ошибка проверки подписки:', err);
        ctx.reply('Произошла ошибка. Пожалуйста, повторите попытку позже.');
    }
});

bot.command('gptlovecock', async (ctx) => {
    ctx.reply(`Сегодня в бота зашло ${usersToday} уникальных пользователей.`);
});

bot.action('option5', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || '';

    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Ошибка при проверке пользователя в базе данных:', err.message);
        } else {
            if (!row) {
                db.run('INSERT INTO users (user_id, username) VALUES (?, ?)', [userId, username], (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении пользователя в базу данных:', err.message);
                    } else {
                        console.log('Пользователь успешно добавлен в базу данных');
                    }
                });
                usersToday++;
            }
        }
    });

    await ctx.reply('Задай мне вопрос.');

    bot.on('text', async (ctx) => {
        const text = ctx.message?.text;

        try {
            const sentMessage = await sendMessageToBot(ctx.chat.id, writingIndicator);

            const chatCompletion = await openai.chat.completions.create({
                messages: [
                    { role: 'user', content: text },
                    ...conversationContext[ctx.chat.id]?.history || []
                ],
                model: 'gpt-4-turbo',
            });

            const response = chatCompletion.choices[0]?.message.content;

            bot.telegram.editMessageText(ctx.chat.id, sentMessage.message_id, null, response);

            conversationContext[ctx.chat.id] = {
                history: [
                    ...(conversationContext[ctx.chat.id]?.history || []),
                    { role: 'user', content: text },
                    { role: 'assistant', content: response }
                ]
            };

            const timestamp = new Date().toISOString();
            sheet.addRow([timestamp, userId, text, response]);
            await workbook.xlsx.writeFile('users_activity.xlsx');
        } catch (error) {
            console.error('Ошибка при обработке запроса GPT:', error);
            ctx.reply('При обработке запроса произошла ошибка. Пожалуйста, повторите попытку позже.');
        }
    });
});

function sendMenu(chatId) {
    bot.telegram.sendMessage(chatId, '🏠 Главное меню', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Задать вопрос', callback_data: 'option1' }],
                [{ text: 'Инструкция', callback_data: 'option2' }, {text: 'GPT-4', callback_data: 'option5'}],
                [{ text: 'Поддержка', callback_data: 'option3' }, {text: 'О сервисе', callback_data: 'option4'}]
            ]
        }
    }).catch(console.error);
}

bot.launch().catch(console.error);
