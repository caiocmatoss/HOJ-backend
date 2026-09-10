import { PushReceiptService } from './push-receipt.service';

describe('PushReceiptService', () => {
  const deliveries = { findMany: jest.fn(), updateMany: jest.fn() };
  const devices = { updateMany: jest.fn() };
  const push = { getReceipts: jest.fn() };
  let service: PushReceiptService;
  beforeEach(() => { jest.clearAllMocks(); service = new PushReceiptService({ pushDelivery: deliveries, pushDevice: devices } as never, push as never); deliveries.updateMany.mockResolvedValue({count:1}); devices.updateMany.mockResolvedValue({count:1}); });
  it('marks delivered receipt and checkedAt', async () => { deliveries.findMany.mockResolvedValue([{id:'d1',ticketId:'t1',pushDeviceId:'p1'}]); push.getReceipts.mockResolvedValue([{ticketId:'t1',status:'DELIVERED'}]); await expect(service.processPending(0)).resolves.toBe(1); expect(deliveries.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'DELIVERED',checkedAt:expect.any(Date)})})); expect(devices.updateMany).not.toHaveBeenCalled(); });
  it('fails and disables device for DeviceNotRegistered', async () => { deliveries.findMany.mockResolvedValue([{id:'d1',ticketId:'t1',pushDeviceId:'p1'}]); push.getReceipts.mockResolvedValue([{ticketId:'t1',status:'INVALID_TOKEN',errorCode:'DeviceNotRegistered'}]); await service.processPending(0); expect(deliveries.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED',errorCode:'DeviceNotRegistered'})})); expect(devices.updateMany).toHaveBeenCalled(); });
  it('keeps pending on transient or missing receipts', async () => { deliveries.findMany.mockResolvedValue([{id:'d1',ticketId:'t1',pushDeviceId:'p1'},{id:'d2',ticketId:'t2',pushDeviceId:'p2'}]); push.getReceipts.mockResolvedValue([{ticketId:'t1',status:'TRANSIENT_ERROR'}]); await expect(service.processPending(0)).resolves.toBe(0); expect(deliveries.updateMany).not.toHaveBeenCalled(); });
  it('queries pending tickets in one provider batch', async () => { deliveries.findMany.mockResolvedValue([{id:'d1',ticketId:'t1',pushDeviceId:'p1'},{id:'d2',ticketId:'t2',pushDeviceId:'p2'}]); push.getReceipts.mockResolvedValue([]); await service.processPending(0,100); expect(push.getReceipts).toHaveBeenCalledTimes(1); expect(push.getReceipts.mock.calls[0][0]).toEqual(['t1','t2']); });
});