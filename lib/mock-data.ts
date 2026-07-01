import type { BillingPeriod, WaterSettings, WaterUser } from "../types/water-system";
export const waterSettings: WaterSettings = { villageName:"ระบบประปาหมู่บ้าน", serviceFee:20, unitPrice:8, meterMaxValue:9999 };
const seedTimestamp = "2026-06-01T00:00:00.000Z";
export const currentBillingPeriod: BillingPeriod = { id:"period-2569-06", periodName:"มิถุนายน 2569", month:6, year:2569, status:"open", openedAt:seedTimestamp, closedAt:null };
const now = seedTimestamp;
export const waterUsers: WaterUser[] = [
{id:"user-001",userCode:"001",fullName:"นายสมชาย ใจดี",address:"12",villageNo:"1",phone:"0800000001",status:"active",serviceOnly:false,cutMeter:false,lastReading:1898,createdAt:now,updatedAt:now},
{id:"user-002",userCode:"002",fullName:"นางสมศรี มีสุข",address:"15",villageNo:"1",phone:"0800000002",status:"active",serviceOnly:false,cutMeter:false,lastReading:231,createdAt:now,updatedAt:now},
{id:"user-003",userCode:"003",fullName:"ร้านค้าชุมชน",address:"20",villageNo:"1",phone:"0800000003",status:"active",serviceOnly:true,serviceFeeOverride:20,cutMeter:false,lastReading:0,createdAt:now,updatedAt:now},
{id:"user-004",userCode:"004",fullName:"นายทดสอบ มิเตอร์วน",address:"25",villageNo:"2",phone:"0800000004",status:"active",serviceOnly:false,cutMeter:false,lastReading:9998,createdAt:now,updatedAt:now},
{id:"user-005",userCode:"005",fullName:"บ้านตัดมิเตอร์",address:"30",villageNo:"2",phone:"0800000005",status:"cut",serviceOnly:false,cutMeter:true,lastReading:500,createdAt:now,updatedAt:now},
{id:"user-006",userCode:"006",fullName:"นางมาลี น้ำใจ",address:"33",villageNo:"2",phone:"0800000006",status:"active",serviceOnly:false,cutMeter:false,lastReading:620,createdAt:now,updatedAt:now},
{id:"user-007",userCode:"007",fullName:"นายบุญมี ดีมาก",address:"40",villageNo:"3",phone:"0800000007",status:"active",serviceOnly:false,cutMeter:false,lastReading:100,createdAt:now,updatedAt:now}
];
