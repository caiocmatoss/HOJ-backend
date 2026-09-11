import { Module } from '@nestjs/common';

@Module({})
class IntegrationScheduleModule {}

export const ScheduleModule = {
  forRoot: () => ({ module: IntegrationScheduleModule }),
};
