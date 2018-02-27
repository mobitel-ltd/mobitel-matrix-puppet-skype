# JIRA to Matrix bot

Бот (web-service), который:

* после добавления бота к чату и отправки любого участника сообщения скайп будет создана комната в матрикс;
* сообщения из скайп в матрикс будут написаны от имени так называемого `puppet`, это сгенерированный ботом пользователь с основанным на скайп аккаунте имени автора сообщения;
* автоматически приглашает всех участников, соответствующих скайп аккаунтам, из скайп чата в комнату матрикс
* транслирует в обе стороны сообщения и картинки;
* создает группу в скайп, связанную с текущей комнатой в матрикс по после добавления в комнату паппета скайп пользователя, к группе будут добавлены все участники матрикс комнаты в соответствие с их скайп аккаунтами.


## Стек технологий
- NodeJS 7.8+ [Документация](https://nodejs.org/dist/latest-v5.x/docs/api/)
- ES2016+
- ESLint [linting utility for JavaScript](http://eslint.org/)
- Riot [free Matrix group chat](https://about.riot.im/) Далее `Riot` используется в качестве примера веб-клиента Matrix.
- Используется [неофициальное skype-HTTP API](https://github.com/ocilo/skype-http).

## Установка и запуск
1. Удобным для Вас способом сохраните репозиторий.
2. Зайдите в директорию, содержащую `package.json` данного проекта и запутите команду `npm install`. [Подробнее](https://docs.npmjs.com/cli/install).
3. Убедитесь, что конфиг на основе `config.sample.json` сформирован верно.
4. Создайте `skype-registration.yaml` командой `node index.js -r -u "http://your-bridge-server:8090"`, используя локальное имя и пароль для Вашего бота. [Подробнее](https://github.com/matrix-org/matrix-appservice-bridge/blob/master/HOWTO.md#registering-as-an-application-service).
5. Скопируйте `skype-registration.yaml` файл в ваш домашний сервер, скорректировав его url в соответствие с Вашим bridge сервером.
6. Обновите свой ` homeserver.yaml` файл, добавив путь к `skype-registration.yaml` файлу в `app_service_config_files` [Подробнее](https://github.com/matrix-org/matrix-appservice-bridge/blob/master/HOWTO.md#configuration)

Конфиг

Работа бота стрится на основе конфига, пример ниже:

```js
{
  // Скайп параметры для бота
  "skype": {
    "username": "",
    "password": ""
  },
  // Путь до файла
  "registrationPath": "skype-registration.yaml",
  // Порт для данных от матрикса
  "port": 3000,
  // Ваши данные для Bridge
  "bridge": {
    "homeserverUrl":"https://your.home.server",
    "domain": "your.home.server",
    "registration": "skype-registration.yaml"
  },
  // Исключения, например id бота
  "SKYPE_USERS_TO_IGNORE": []
}
```


Успешно развернут в средней по велечине компании.