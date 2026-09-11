class Expo {
  constructor() {}

  static isExpoPushToken(token) {
    return typeof token === 'string' && token.startsWith('ExponentPushToken[');
  }

  chunkPushNotifications(messages) {
    return [messages];
  }

  chunkPushNotificationReceiptIds(ids) {
    return [ids];
  }

  async sendPushNotificationsAsync() {
    throw new Error('expo-server-sdk send should not be invoked in messaging integration tests');
  }

  async getPushNotificationReceiptsAsync() {
    throw new Error('expo-server-sdk receipts should not be invoked in messaging integration tests');
  }
}

module.exports = { Expo };
