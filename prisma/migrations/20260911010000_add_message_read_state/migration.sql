CREATE TYPE "MessageThreadType" AS ENUM ('DIRECT', 'GROUP');

CREATE TABLE "MessageReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadType" "MessageThreadType" NOT NULL,
    "threadKey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "lastReadMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageReadState_userId_threadType_threadKey_key"
ON "MessageReadState"("userId", "threadType", "threadKey");
CREATE INDEX "MessageReadState_userId_threadType_idx"
ON "MessageReadState"("userId", "threadType");
CREATE INDEX "MessageReadState_threadType_threadKey_idx"
ON "MessageReadState"("threadType", "threadKey");

ALTER TABLE "MessageReadState"
ADD CONSTRAINT "MessageReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
