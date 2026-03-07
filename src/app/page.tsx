'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  supabase, HOUSEHOLD_ID,
  getChores, markChoreDone, addChore, updateChore, deleteChore,
  getBills, addBill, updateBill, deleteBill, getDealsForBill,
  getMealPlan, saveMealPlan,
  getNotifications, markNotificationRead, markAllNotificationsRead,
  getHousehold,
  choreStatus, daysUntilDue, nextDueDate, effectiveFreq,
  type Chore, type Bill, type BillDeal, type MealPlan, type Notification, type Household,
} from '@/lib/supabase'
import { format, addDays, startOfToday } from 'date-fns'

// ─── STYLES ───────────────────────────────────────────────────────────────────
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Lato:wght@300;400;700&display=swap');
:root{--cream:#F5F0E8;--linen:#EDE5D8;--warm-white:#FAF7F2;--terra:#C1714F;--terra-l:#D4896A;--terra-d:#A05A3A;--sage:#7A9E7E;--sage-l:#A8C5AB;--rose:#C4877A;--charcoal:#3D3530;--grey:#8A7E78;--gold:#C4962A;--gold-l:#E8B84B}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--charcoal)}
.app{min-height:100vh;background:var(--cream);background-image:radial-gradient(ellipse at 15% 0%,rgba(193,113,79,.07) 0%,transparent 55%),radial-gradient(ellipse at 85% 100%,rgba(122,158,126,.07) 0%,transparent 55%)}
.hdr{background:var(--charcoal);padding:0 1.5rem;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:200;box-shadow:0 2px 20px rgba(61,53,48,.35)}
.hdr-brand{display:flex;align-items:center;gap:.7rem}
.hdr-ico{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--terra),var(--terra-l));display:flex;align-items:center;justify-content:center;font-size:17px}
.hdr-name{font-family:'Playfair Display',serif;font-size:1.25rem;color:var(--cream)}
.hdr-sub{font-size:.65rem;color:var(--grey);letter-spacing:.08em;text-transform:uppercase}
.hdr-right{display:flex;align-items:center;gap:.8rem}
.hdr-date{text-align:right;color:var(--grey);font-size:.75rem}
.hdr-date strong{display:block;color:var(--linen);font-size:.9rem;font-weight:300}
.notif-btn{position:relative;width:34px;height:34px;border-radius:9px;border:1px solid rgba(245,240,232,.15);background:rgba(245,240,232,.06);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:background .15s}
.notif-btn:hover{background:rgba(245,240,232,.12)}
.notif-dot{position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:50%;background:var(--terra);border:2px solid var(--charcoal)}
.tg-badge{padding:.25rem .6rem;border-radius:20px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border:none;transition:all .15s;font-family:'Lato',sans-serif}
.tg-on{background:rgba(122,158,126,.2);color:#A8C5AB}.tg-off{background:rgba(193,113,79,.2);color:var(--terra-l)}
.nav{background:var(--warm-white);border-bottom:1px solid rgba(193,113,79,.13);display:flex;padding:0 1.5rem;overflow-x:auto}
.nav-btn{padding:.85rem 1.3rem;border:none;background:none;cursor:pointer;font-family:'Lato',sans-serif;font-size:.78rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--grey);border-bottom:3px solid transparent;transition:all .2s;white-space:nowrap;display:flex;align-items:center;gap:.4rem;position:relative}
.nav-btn:hover{color:var(--terra)}.nav-btn.active{color:var(--terra);border-bottom-color:var(--terra)}
.nav-count{position:absolute;top:10px;right:6px;min-width:16px;height:16px;border-radius:8px;background:var(--terra);color:white;font-size:.6rem;display:flex;align-items:center;justify-content:center;padding:0 4px}
.main{padding:1.5rem;max-width:1400px;margin:0 auto}
.section-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.5rem;gap:1rem;flex-wrap:wrap}
.section-title{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--charcoal)}
.section-title span{color:var(--terra);font-style:italic}
.section-sub{font-size:.78rem;color:var(--grey);margin-top:.2rem}
.btn-out{padding:.45rem 1rem;border-radius:9px;border:1px solid rgba(193,113,79,.3);background:transparent;color:var(--terra);font-size:.73rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;transition:all .15s;font-family:'Lato',sans-serif}
.btn-out:hover{background:var(--terra);color:white}
.btn-out:disabled{opacity:.4;cursor:not-allowed}
.btn-solid{padding:.45rem 1rem;border-radius:9px;border:none;background:var(--terra);color:white;font-size:.73rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;transition:all .15s;font-family:'Lato',sans-serif}
.btn-solid:hover{background:var(--terra-d)}
.btn-solid:disabled{opacity:.4;cursor:not-allowed}
.card{background:var(--warm-white);border-radius:16px;padding:1.4rem;border:1px solid rgba(193,113,79,.1);box-shadow:0 2px 12px rgba(61,53,48,.05)}
.card-title{font-family:'Playfair Display',serif;font-size:1rem;color:var(--charcoal);margin-bottom:1rem;display:flex;align-items:center;gap:.5rem}
.greeting{background:linear-gradient(135deg,var(--charcoal) 0%,#5a4a42 100%);border-radius:18px;padding:1.8rem 2rem;color:var(--cream);position:relative;overflow:hidden;margin-bottom:1.5rem}
.greeting::before{content:'';position:absolute;top:-50px;right:-50px;width:220px;height:220px;border-radius:50%;background:rgba(193,113,79,.12)}
.greeting::after{content:'';position:absolute;bottom:-70px;left:35%;width:240px;height:240px;border-radius:50%;background:rgba(122,158,126,.09)}
.gt{font-family:'Playfair Display',serif;font-size:1.9rem;position:relative;z-index:1}
.gs{font-size:.82rem;color:rgba(245,240,232,.6);font-weight:300;position:relative;z-index:1;margin-top:.3rem}
.gstats{display:flex;gap:2rem;margin-top:1.5rem;position:relative;z-index:1;flex-wrap:wrap}
.gn{font-family:'Playfair Display',serif;font-size:2.2rem;color:var(--gold-l);line-height:1}
.gl{font-size:.65rem;color:rgba(245,240,232,.55);text-transform:uppercase;letter-spacing:.08em;margin-top:.2rem}
.ov-grid{display:grid;grid-template-columns:2fr 1fr;gap:1.2rem}
@media(max-width:900px){.ov-grid{grid-template-columns:1fr}}
.alerts-banner{background:linear-gradient(135deg,rgba(193,113,79,.1),rgba(196,150,42,.07));border:1px solid rgba(193,113,79,.18);border-radius:14px;padding:1rem 1.4rem;margin-bottom:1.2rem}
.alert-item{display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid rgba(193,113,79,.1)}
.alert-item:last-child{border-bottom:none}
.alert-text{flex:1;font-size:.82rem}
.alert-action{font-size:.7rem;padding:.25rem .7rem;border-radius:20px;background:var(--terra);color:white;border:none;cursor:pointer;font-weight:700;font-family:'Lato',sans-serif;white-space:nowrap}
.filter-row{display:flex;gap:.5rem;margin-bottom:1.2rem;flex-wrap:wrap}
.filter-btn{padding:.32rem .85rem;border-radius:20px;border:1px solid rgba(193,113,79,.18);background:white;font-size:.72rem;cursor:pointer;color:var(--grey);transition:all .15s;font-family:'Lato',sans-serif;font-weight:700;letter-spacing:.04em}
.filter-btn.active{background:var(--terra);color:white;border-color:var(--terra)}
.chores-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:1rem}
.chore-card{background:var(--warm-white);border-radius:14px;padding:1.2rem;border:1px solid rgba(193,113,79,.08);border-left:4px solid var(--sage);transition:all .2s;position:relative}
.chore-card:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(61,53,48,.1)}
.chore-card.overdue{border-left-color:var(--terra)}
.chore-card.due-soon{border-left-color:var(--gold)}
.chore-card.done-flash{border-left-color:var(--sage);opacity:.6}
.chore-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}
.chore-name{font-family:'Playfair Display',serif;font-size:.97rem}
.badge{font-size:.62rem;padding:.18rem .55rem;border-radius:20px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0}
.badge-overdue{background:rgba(193,113,79,.15);color:var(--terra)}
.badge-soon{background:rgba(196,150,42,.15);color:var(--gold)}
.badge-ok{background:rgba(122,158,126,.15);color:var(--sage)}
.badge-done{background:rgba(122,158,126,.12);color:var(--sage)}
.chore-meta{font-size:.73rem;color:var(--grey);margin-bottom:.5rem}
.learn-bar{height:3px;background:rgba(193,113,79,.1);border-radius:2px;margin:.55rem 0;overflow:hidden}
.learn-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--sage),var(--sage-l));transition:width .5s}
.learn-lbl{font-size:.63rem;color:var(--grey);display:flex;justify-content:space-between}
.learn-lbl span{color:var(--sage);font-weight:700}
.assignees{display:flex;align-items:center;gap:.35rem;margin-bottom:.65rem}
.av{width:20px;height:20px;border-radius:50%;background:var(--terra);display:flex;align-items:center;justify-content:center;font-size:.58rem;color:white;font-weight:700;flex-shrink:0}
.av.b{background:var(--sage)}
.av-lbl{font-size:.72rem;color:var(--grey)}
.chore-actions{display:flex;gap:.5rem;margin-top:.7rem}
.chore-btn{flex:1;padding:.45rem;border-radius:8px;border:1px solid rgba(193,113,79,.25);background:transparent;color:var(--terra);font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;transition:all .15s;font-family:'Lato',sans-serif}
.chore-btn:hover{background:var(--terra);color:white}
.chore-btn:disabled{opacity:.4;cursor:not-allowed}
.chore-btn.done-st{border-color:var(--sage);color:var(--sage)}
.chore-btn.done-st:hover{background:var(--sage);color:white}
.add-card{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:1.2rem;border-radius:14px;border:2px dashed rgba(193,113,79,.22);background:transparent;color:var(--grey);font-size:.8rem;cursor:pointer;transition:all .2s;font-family:'Lato',sans-serif;font-weight:700;letter-spacing:.04em;min-height:120px}
.add-card:hover{border-color:var(--terra);color:var(--terra);background:rgba(193,113,79,.03)}
.bills-list{display:flex;flex-direction:column;gap:.8rem}
.bill-row{background:var(--warm-white);border-radius:14px;padding:1.1rem 1.3rem;border:1px solid rgba(193,113,79,.08);overflow:hidden;transition:all .2s}
.bill-row:hover{box-shadow:0 4px 18px rgba(61,53,48,.08)}
.bill-main{display:flex;align-items:center;gap:1rem}
.bill-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0}
.bill-info{flex:1;min-width:0}
.bill-name{font-family:'Playfair Display',serif;font-size:.97rem}
.bill-detail{font-size:.74rem;color:var(--grey);margin-top:.15rem}
.bill-right{text-align:right;flex-shrink:0}
.bill-amt{font-family:'Playfair Display',serif;font-size:1.05rem}
.bill-due{font-size:.7rem;margin-top:.2rem}
.renew-bar{height:3px;background:rgba(193,113,79,.1);border-radius:2px;margin-top:.5rem;overflow:hidden}
.renew-fill{height:100%;border-radius:2px;transition:width .6s}
.bill-expand{margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(193,113,79,.1)}
.deals-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.8rem;margin-top:.8rem}
.deal-card{background:var(--linen);border-radius:12px;padding:1rem;border:1px solid rgba(193,113,79,.12);cursor:pointer;transition:all .15s}
.deal-card:hover{border-color:var(--terra);background:rgba(193,113,79,.04)}
.deal-provider{font-size:.78rem;font-weight:700;color:var(--charcoal)}
.deal-price{font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--terra);margin:.3rem 0}
.deal-saving{font-size:.7rem;color:var(--sage);font-weight:700}
.deal-detail{font-size:.7rem;color:var(--grey);margin-top:.3rem;line-height:1.4}
.deal-cta{margin-top:.7rem;width:100%;padding:.4rem;border-radius:7px;border:none;background:var(--terra);color:white;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;font-family:'Lato',sans-serif}
.searching-state{display:flex;align-items:center;gap:.8rem;padding:.8rem;color:var(--grey);font-size:.82rem}
.spin{width:18px;height:18px;border:2px solid rgba(193,113,79,.2);border-top-color:var(--terra);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.week-tabs{display:flex;gap:.5rem;margin-bottom:1.2rem}
.wtab{padding:.45rem 1.1rem;border-radius:9px;border:1px solid rgba(193,113,79,.15);background:white;font-size:.75rem;cursor:pointer;color:var(--grey);transition:all .15s;font-family:'Lato',sans-serif;font-weight:700}
.wtab.active{background:var(--charcoal);color:var(--cream);border-color:var(--charcoal)}
.meal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:.55rem}
@media(max-width:900px){.meal-grid{grid-template-columns:repeat(4,1fr)}}
@media(max-width:600px){.meal-grid{grid-template-columns:repeat(2,1fr)}}
.meal-day{background:var(--warm-white);border-radius:12px;overflow:hidden;border:1px solid rgba(193,113,79,.1)}
.meal-day.today{border:2px solid var(--terra)}
.meal-day-hdr{background:var(--charcoal);padding:.5rem .4rem;text-align:center}
.meal-day.today .meal-day-hdr{background:var(--terra)}
.meal-day-name{font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--linen)}
.meal-day-date{font-size:.62rem;color:var(--grey);margin-top:.1rem}
.meal-slot{padding:.55rem .5rem;border-bottom:1px solid rgba(193,113,79,.07);min-height:62px}
.meal-slot:last-child{border-bottom:none}
.meal-slot-lbl{font-size:.58rem;text-transform:uppercase;letter-spacing:.07em;color:var(--grey);margin-bottom:.25rem;font-weight:700}
.meal-slot-name{font-size:.7rem;color:var(--charcoal);line-height:1.3;font-family:'Playfair Display',serif}
.meal-empty{font-size:.68rem;color:rgba(138,126,120,.4);font-style:italic}
.mtag{display:inline-block;font-size:.52rem;padding:.08rem .35rem;border-radius:9px;margin-top:.2rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase}
.mtag-quick{background:rgba(122,158,126,.15);color:var(--sage)}
.mtag-hf{background:rgba(193,113,79,.12);color:var(--terra)}
.mtag-gc{background:rgba(196,150,42,.12);color:var(--gold)}
.ai-wrap{display:grid;grid-template-columns:1fr 300px;gap:1.2rem}
@media(max-width:900px){.ai-wrap{grid-template-columns:1fr}}
.ai-chat{background:var(--warm-white);border-radius:16px;border:1px solid rgba(193,113,79,.1);overflow:hidden;display:flex;flex-direction:column;height:620px}
.ai-chat-hdr{background:var(--charcoal);padding:1rem 1.3rem;display:flex;align-items:center;gap:.8rem}
.ai-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--terra),var(--rose));display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0}
.ai-name-text{font-family:'Playfair Display',serif;color:var(--cream);font-size:1.05rem}
.ai-status{font-size:.68rem;color:var(--sage-l);display:flex;align-items:center;gap:.35rem;margin-top:.1rem}
.pulse{width:6px;height:6px;border-radius:50%;background:var(--sage-l);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.ai-msgs{flex:1;overflow-y:auto;padding:1.1rem;display:flex;flex-direction:column;gap:.9rem}
.ai-msgs::-webkit-scrollbar{width:3px}
.ai-msgs::-webkit-scrollbar-thumb{background:rgba(193,113,79,.25);border-radius:2px}
.msg{max-width:84%}
.msg.user{align-self:flex-end}.msg.ai{align-self:flex-start}
.msg-bub{padding:.75rem .95rem;border-radius:15px;font-size:.82rem;line-height:1.6;white-space:pre-wrap}
.msg.user .msg-bub{background:var(--terra);color:white;border-bottom-right-radius:3px}
.msg.ai .msg-bub{background:var(--linen);color:var(--charcoal);border-bottom-left-radius:3px;border:1px solid rgba(193,113,79,.08)}
.msg-time{font-size:.62rem;color:var(--grey);margin-top:.25rem}
.msg.user .msg-time{text-align:right}
.typing-dots{display:flex;gap:4px;align-items:center;padding:.75rem .95rem}
.tdot{width:7px;height:7px;border-radius:50%;background:var(--grey);animation:typing 1.2s infinite}
.tdot:nth-child(2){animation-delay:.2s}.tdot:nth-child(3){animation-delay:.4s}
@keyframes typing{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
.ai-suggs{display:flex;gap:.4rem;padding:.55rem 1.1rem;background:var(--linen);overflow-x:auto;border-top:1px solid rgba(193,113,79,.08)}
.ai-sugg{white-space:nowrap;padding:.3rem .75rem;border-radius:18px;border:1px solid rgba(193,113,79,.22);background:white;font-size:.7rem;color:var(--terra);cursor:pointer;transition:all .15s;font-family:'Lato',sans-serif}
.ai-sugg:hover{background:var(--terra);color:white}
.ai-input-area{padding:.9rem 1.1rem;background:var(--linen);border-top:1px solid rgba(193,113,79,.1);display:flex;gap:.6rem;align-items:flex-end}
.ai-inp{flex:1;background:white;border:1px solid rgba(193,113,79,.18);border-radius:11px;padding:.65rem .9rem;font-family:'Lato',sans-serif;font-size:.82rem;color:var(--charcoal);resize:none;outline:none;transition:border .2s;min-height:40px;max-height:90px}
.ai-inp:focus{border-color:var(--terra)}
.ai-inp::placeholder{color:var(--grey)}
.ai-send{width:40px;height:40px;border-radius:9px;background:var(--terra);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.95rem;transition:all .15s;flex-shrink:0}
.ai-send:hover{background:var(--terra-d)}.ai-send:disabled{opacity:.45;cursor:not-allowed}
.sidebar{display:flex;flex-direction:column;gap:1rem}
.notif-panel{background:var(--warm-white);border-radius:16px;border:1px solid rgba(193,113,79,.1);overflow:hidden}
.notif-hdr{background:var(--charcoal);padding:.9rem 1.1rem;font-family:'Playfair Display',serif;color:var(--cream);font-size:.95rem;display:flex;justify-content:space-between;align-items:center}
.notif-hdr span{font-size:.65rem;color:var(--grey);font-family:'Lato',sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.notif-list{max-height:260px;overflow-y:auto}
.notif-item{padding:.7rem 1rem;border-bottom:1px solid rgba(193,113,79,.07);font-size:.78rem;display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;transition:background .15s}
.notif-item:hover{background:rgba(193,113,79,.04)}.notif-item:last-child{border-bottom:none}
.notif-item.unread{background:rgba(193,113,79,.04)}
.notif-ico{font-size:1rem;flex-shrink:0;margin-top:.05rem}
.notif-body{flex:1}
.notif-title{font-weight:700;color:var(--charcoal);margin-bottom:.1rem}
.notif-sub{color:var(--grey);font-size:.72rem;line-height:1.4}
.notif-time{font-size:.65rem;color:var(--grey);margin-top:.15rem}
.learn-panel{background:var(--warm-white);border-radius:16px;padding:1.1rem;border:1px solid rgba(193,113,79,.1)}
.learn-title{font-family:'Playfair Display',serif;font-size:.95rem;margin-bottom:.8rem;display:flex;align-items:center;gap:.4rem}
.learn-item{display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid rgba(193,113,79,.07);font-size:.75rem}
.learn-item:last-child{border-bottom:none}
.learn-item-r{text-align:right}
.learn-days{color:var(--terra);font-weight:700;font-family:'Playfair Display',serif}
.learn-conf{font-size:.65rem;color:var(--grey)}
.modal-overlay{position:fixed;inset:0;background:rgba(61,53,48,.5);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;padding:1rem}
.modal{background:var(--warm-white);border-radius:18px;padding:1.8rem;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(61,53,48,.25);animation:modalIn .2s ease}
@keyframes modalIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
.modal-title{font-family:'Playfair Display',serif;font-size:1.3rem;margin-bottom:1.2rem}
.form-group{margin-bottom:1rem}
.form-label{font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);margin-bottom:.4rem;display:block}
.form-input{width:100%;padding:.65rem .9rem;border:1px solid rgba(193,113,79,.2);border-radius:10px;font-family:'Lato',sans-serif;font-size:.85rem;color:var(--charcoal);outline:none;background:white;transition:border .2s}
.form-input:focus{border-color:var(--terra)}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.modal-actions{display:flex;gap:.7rem;margin-top:1.4rem}
.setup-card{background:linear-gradient(135deg,var(--charcoal),#5a4a42);border-radius:16px;padding:1.5rem;color:var(--cream);margin-bottom:1.2rem}
.setup-title{font-family:'Playfair Display',serif;font-size:1.1rem;margin-bottom:.6rem}
.setup-steps{display:flex;flex-direction:column;gap:.6rem;margin-top:.8rem}
.setup-step{display:flex;align-items:flex-start;gap:.8rem;font-size:.8rem;color:rgba(245,240,232,.8);line-height:1.5}
.step-num{width:22px;height:22px;border-radius:50%;background:rgba(193,113,79,.4);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;flex-shrink:0;margin-top:.05rem}
.setup-input-row{display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap}
.setup-inp{flex:1;min-width:200px;padding:.6rem .9rem;border-radius:9px;border:1px solid rgba(245,240,232,.15);background:rgba(245,240,232,.08);color:var(--cream);font-family:'Lato',sans-serif;font-size:.82rem;outline:none}
.setup-inp::placeholder{color:rgba(245,240,232,.4)}
.setup-inp:focus{border-color:rgba(193,113,79,.6)}
.skeleton{background:linear-gradient(90deg,rgba(193,113,79,.06) 0%,rgba(193,113,79,.12) 50%,rgba(193,113,79,.06) 100%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
`

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (d: Date) => format(d, 'd MMM')
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const pence = (p: number) => `£${(p/100).toFixed(0)}`
const penceFull = (p: number) => `£${(p/100).toFixed(2)}`

const SUGGS = [
  "What's overdue this week?",
  "Who should do laundry next?",
  "Find better broadband deals",
  "When does our mortgage renew?",
  "Plan this week's meals",
  "Search for cheaper energy",
]

// ─── MODAL: Add Chore ─────────────────────────────────────────────────────────
function AddChoreModal({ onClose, onAdd }: { onClose: () => void; onAdd: (f: any) => Promise<void> }) {
  const [form, setForm] = useState({ name:'', room:'', icon:'🧹', assigned:'Both' as 'A'|'B'|'Both', default_freq_days:7 })
  const [saving, setSaving] = useState(false)
  const rooms = ['Kitchen','Bathroom','Bedroom','Living Room','Laundry','Whole house','Outside']
  const icons = ['🧹','🧺','🛏️','🚿','🍳','🧽','🗑️','🪟','☕','🪞','👕','🔧','🌱','🧴','🪣']
  const submit = async () => {
    if (!form.name || !form.room) return
    setSaving(true)
    await onAdd(form)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Add New Chore</div>
        <div className="form-group">
          <label className="form-label">Chore name</label>
          <input className="form-input" placeholder="e.g. Clean microwave" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Room</label>
            <select className="form-input" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}>
              <option value="">Select…</option>
              {rooms.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Icon</label>
            <select className="form-input" value={form.icon} onChange={e=>setForm({...form,icon:e.target.value})}>
              {icons.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Assigned to</label>
            <select className="form-input" value={form.assigned} onChange={e=>setForm({...form,assigned:e.target.value as any})}>
              {['Both','A','B'].map(a=><option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Starting frequency (days)</label>
            <input type="number" className="form-input" value={form.default_freq_days} min={1} max={365}
              onChange={e=>setForm({...form,default_freq_days:+e.target.value})} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-out" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={submit} disabled={saving}>
            {saving ? 'Adding…' : 'Add Chore'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── MODAL: Edit Chore ────────────────────────────────────────────────────────
function EditChoreModal({ chore, onClose, onSave }: { chore: Chore; onClose: () => void; onSave: (id: string, f: any) => Promise<void> }) {
  const [form, setForm] = useState({
    name: chore.name,
    room: chore.room,
    icon: chore.icon,
    assigned: chore.assigned,
    default_freq_days: chore.default_freq_days,
  })
  const [saving, setSaving] = useState(false)
  const rooms = ['Kitchen','Bathroom','Bedroom','Living Room','Laundry','Whole house','Outside']
  const icons = ['🧹','🧺','🛏️','🚿','🍳','🧽','🗑️','🪟','☕','🪞','👕','🔧','🌱','🧴','🪣']

  const submit = async () => {
    if (!form.name || !form.room) return
    setSaving(true)
    await onSave(chore.id, form)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Edit Chore</div>
        <div className="form-group">
          <label className="form-label">Chore name</label>
          <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Room</label>
            <select className="form-input" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}>
              {rooms.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Icon</label>
            <select className="form-input" value={form.icon} onChange={e=>setForm({...form,icon:e.target.value})}>
              {icons.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Assigned to</label>
          <div style={{display:'flex',gap:'.6rem',marginTop:'.2rem'}}>
            {(['Both','A','B'] as const).map(a => (
              <button key={a} onClick={()=>setForm({...form,assigned:a})}
                style={{flex:1,padding:'.6rem',borderRadius:'9px',border:`2px solid ${form.assigned===a?'var(--terra)':'rgba(193,113,79,.2)'}`,background:form.assigned===a?'var(--terra)':'white',color:form.assigned===a?'white':'var(--charcoal)',cursor:'pointer',fontFamily:"'Lato',sans-serif",fontWeight:'700',fontSize:'.82rem',transition:'all .15s'}}>
                {a === 'Both' ? '👫 Both' : a === 'A' ? '👤 Person A' : '👤 Person B'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Default frequency (days)</label>
          <input type="number" className="form-input" value={form.default_freq_days} min={1} max={365}
            onChange={e=>setForm({...form,default_freq_days:+e.target.value})} style={{maxWidth:'160px'}} />
          <div style={{fontSize:'.72rem',color:'var(--grey)',marginTop:'.3rem'}}>
            Note: the learning engine will override this once it has enough data
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-out" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CHORES TAB ───────────────────────────────────────────────────────────────
function ChoresTab({ chores, loading, onMarkDone, onAdd, onEdit, onDelete }: {
  chores: (Chore & { chore_completions: any[] })[]
  loading: boolean
  onMarkDone: (id: string) => Promise<void>
  onAdd: (f: any) => Promise<void>
  onEdit: (id: string, f: any) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editChore, setEditChore] = useState<Chore | null>(null)
  const [marking, setMarking] = useState<string | null>(null)

  const handleMark = async (id: string) => {
    setMarking(id)
    await onMarkDone(id)
    setMarking(null)
  }

  const filtered = chores
    .filter(c => {
      const s = choreStatus(c)
      if (filter === 'overdue') return s === 'overdue'
      if (filter === 'soon') return s === 'due-soon'
      if (filter === 'ok') return s === 'ok'
      return true
    })
    .sort((a,b) => daysUntilDue(a) - daysUntilDue(b))

  const overdue = chores.filter(c => choreStatus(c) === 'overdue').length
  const soon = chores.filter(c => choreStatus(c) === 'due-soon').length

  return (
    <div>
      {showModal && <AddChoreModal onClose={() => setShowModal(false)} onAdd={onAdd} />}
      {editChore && <EditChoreModal chore={editChore} onClose={() => setEditChore(null)} onSave={onEdit} />}
      <div className="section-hdr">
        <div>
          <h2 className="section-title">Chore <span>Tracker</span></h2>
          <p className="section-sub">Self-learning · {overdue} overdue · {soon} due soon</p>
        </div>
        <button className="btn-out" onClick={() => setShowModal(true)}>+ Add Chore</button>
      </div>
      <div className="filter-row">
        {[['all','All'],[`overdue`,`⚠️ Overdue (${overdue})`],['soon',`⏳ Due Soon (${soon})`],['ok','✅ On Track']].map(([f,l]) => (
          <button key={f} className={`filter-btn ${filter===f?'active':''}`} onClick={() => setFilter(f)}>{l}</button>
        ))}
      </div>
      {loading ? (
        <div className="chores-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{height:'160px',borderRadius:'14px'}} />)}
        </div>
      ) : (
        <div className="chores-grid">
          {filtered.map(chore => {
            const s = choreStatus(chore)
            const d = daysUntilDue(chore)
            const freq = effectiveFreq(chore)
            const conf = chore.confidence_pct
            const samples = chore.completions_count || 0
            const isMarking = marking === chore.id
            return (
              <div key={chore.id} className={`chore-card ${s} ${isMarking?'done-flash':''}`}>
                <div className="chore-head">
                  <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
                    <span style={{fontSize:'1.25rem'}}>{chore.icon}</span>
                    <div>
                      <div className="chore-name">{chore.name}</div>
                      <div className="chore-meta">{chore.room}</div>
                    </div>
                  </div>
                  <span className={`badge ${s==='overdue'?'badge-overdue':s==='due-soon'?'badge-soon':isMarking?'badge-done':'badge-ok'}`}>
                    {isMarking ? '✓ Done!' : s==='overdue' ? `${Math.abs(d)}d late` : d===0 ? 'Today' : `${d}d`}
                  </span>
                </div>
                <div>
                  <div className="learn-bar"><div className="learn-fill" style={{width:`${conf}%`}} /></div>
                  <div className="learn-lbl">
                    <span>🧠 {conf<33?'Learning…':conf<66?'Getting smarter':'Well trained'}</span>
                    <span>{conf>=33?`~${freq}d avg (${samples} pts)`:`Default: ${freq}d`}</span>
                  </div>
                </div>
                <div className="assignees">
                  {chore.assigned==='Both'?<><div className="av">A</div><div className="av b">B</div><span className="av-lbl">Both</span></>:
                   chore.assigned==='A'?<><div className="av">A</div><span className="av-lbl">Person A</span></>:
                   <><div className="av b">B</div><span className="av-lbl">Person B</span></>}
                  <span style={{marginLeft:'auto',fontSize:'.68rem',color:'var(--grey)'}}>
                    Due: {fmt(nextDueDate(chore))}
                  </span>
                </div>
                <div className="chore-actions">
                  <button className={`chore-btn ${isMarking?'done-st':''}`} disabled={isMarking}
                    onClick={() => handleMark(chore.id)}>
                    {isMarking ? '✓ Marked!' : 'Mark Done'}
                  </button>
                  <button className="chore-btn" style={{maxWidth:'42px',fontSize:'.85rem'}} onClick={() => setEditChore(chore)} title="Edit">✏️</button>
                  <button className="chore-btn" style={{maxWidth:'42px',fontSize:'.85rem',borderColor:'rgba(193,113,79,.2)',color:'var(--grey)'}} onClick={() => onDelete(chore.id)} title="Delete">🗑️</button>
                </div>
              </div>
            )
          })}
          <button className="add-card" onClick={() => setShowModal(true)}>
            <span style={{fontSize:'1.3rem'}}>+</span> Add new chore
          </button>
        </div>
      )}
    </div>
  )
}


// ─── MODAL: Add Bill ──────────────────────────────────────────────────────────
function AddBillModal({ onClose, onAdd }: { onClose: () => void; onAdd: (f: any) => Promise<void> }) {
  const [form, setForm] = useState({ name:'', icon:'💰', color:'#C1714F', provider:'', bill_type:'other', amount_pence:0, due_day_of_month:1, renewal_date:'' })
  const [saving, setSaving] = useState(false)
  const TYPES = ['mortgage','energy','broadband','car_insurance','home_insurance','council','other']
  const ICONS = ['💰','🏡','⚡','📡','🚗','🔒','🏛️','📺','💧','🌐']
  const submit = async () => {
    if (!form.name) return
    setSaving(true)
    await onAdd({ ...form, amount_pence: Math.round(form.amount_pence * 100), renewal_date: form.renewal_date || null })
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Add New Bill</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Bill name</label>
            <input className="form-input" placeholder="e.g. Water bill" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Icon</label>
            <select className="form-input" value={form.icon} onChange={e=>setForm({...form,icon:e.target.value})}>
              {ICONS.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Provider</label>
            <input className="form-input" placeholder="e.g. Thames Water" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input" value={form.bill_type} onChange={e=>setForm({...form,bill_type:e.target.value})}>
              {TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Monthly amount (£)</label>
            <input type="number" className="form-input" placeholder="0.00" step="0.01" value={form.amount_pence||''} onChange={e=>setForm({...form,amount_pence:+e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Payment day of month</label>
            <input type="number" className="form-input" min={1} max={31} value={form.due_day_of_month} onChange={e=>setForm({...form,due_day_of_month:+e.target.value})} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Renewal date (optional)</label>
          <input type="date" className="form-input" value={form.renewal_date} onChange={e=>setForm({...form,renewal_date:e.target.value})} />
        </div>
        <div className="modal-actions">
          <button className="btn-out" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={submit} disabled={saving}>{saving?'Adding…':'Add Bill'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL: Edit Bill ─────────────────────────────────────────────────────────
function EditBillModal({ bill, onClose, onSave }: { bill: Bill; onClose: () => void; onSave: (id: string, f: any) => Promise<void> }) {
  const [form, setForm] = useState({
    name: bill.name,
    icon: bill.icon,
    provider: bill.provider || '',
    bill_type: bill.bill_type,
    amount_pounds: (bill.amount_pence / 100).toFixed(2),
    due_day_of_month: bill.due_day_of_month || 1,
    renewal_date: bill.renewal_date ? bill.renewal_date.split('T')[0] : '',
  })
  const [saving, setSaving] = useState(false)
  const TYPES = ['mortgage','energy','broadband','car_insurance','home_insurance','council','other']
  const ICONS = ['💰','🏡','⚡','📡','🚗','🔒','🏛️','📺','💧','🌐']
  const submit = async () => {
    setSaving(true)
    await onSave(bill.id, {
      name: form.name,
      icon: form.icon,
      provider: form.provider,
      bill_type: form.bill_type,
      amount_pence: Math.round(parseFloat(form.amount_pounds) * 100),
      due_day_of_month: form.due_day_of_month,
      renewal_date: form.renewal_date || null,
    })
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Edit Bill</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Bill name</label>
            <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Icon</label>
            <select className="form-input" value={form.icon} onChange={e=>setForm({...form,icon:e.target.value})}>
              {ICONS.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Provider</label>
            <input className="form-input" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input" value={form.bill_type} onChange={e=>setForm({...form,bill_type:e.target.value})}>
              {TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Monthly amount (£)</label>
            <input type="number" className="form-input" step="0.01" value={form.amount_pounds} onChange={e=>setForm({...form,amount_pounds:e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Payment day of month</label>
            <input type="number" className="form-input" min={1} max={31} value={form.due_day_of_month} onChange={e=>setForm({...form,due_day_of_month:+e.target.value})} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Renewal date</label>
          <input type="date" className="form-input" value={form.renewal_date} onChange={e=>setForm({...form,renewal_date:e.target.value})} />
        </div>
        <div className="modal-actions">
          <button className="btn-out" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={submit} disabled={saving}>{saving?'Saving…':'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── BILLS TAB ────────────────────────────────────────────────────────────────
function BillsTab({ bills, loading, onEdit, onDelete, onAdd }: { bills: Bill[]; loading: boolean; onEdit: (id: string, f: any) => Promise<void>; onDelete: (id: string) => Promise<void>; onAdd: (f: any) => Promise<void> }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searching, setSearching] = useState<Record<string,boolean>>({})
  const [deals, setDeals] = useState<Record<string, BillDeal[]>>({})
  const [editBill, setEditBill] = useState<Bill | null>(null)
  const [showAddBill, setShowAddBill] = useState(false)

  const searchDeals = async (bill: Bill) => {
    if (searching[bill.id]) return
    if (deals[bill.id]) { setExpanded(prev => prev === bill.id ? null : bill.id); return }
    setExpanded(bill.id)
    setSearching(s => ({...s,[bill.id]:true}))
    try {
      const res = await fetch('/api/deals', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          billId: bill.id,
          billType: bill.bill_type,
          provider: bill.provider,
          monthlyAmountPence: bill.amount_pence,
        }),
      })
      const data = await res.json()
      setDeals(d => ({...d,[bill.id]: data.deals || []}))
    } catch {
      setDeals(d => ({...d,[bill.id]: []}))
    }
    setSearching(s => ({...s,[bill.id]:false}))
  }

  return (
    <div>
      {editBill && <EditBillModal bill={editBill} onClose={() => setEditBill(null)} onSave={onEdit} />}
      {showAddBill && <AddBillModal onClose={() => setShowAddBill(false)} onAdd={onAdd} />}
      <div className="section-hdr">
        <div>
          <h2 className="section-title">Bills & <span>Deals</span></h2>
          <p className="section-sub">Auto-alerts 60 days out · AI searches live deals · data from Supabase</p>
        </div>
        <button className="btn-out" onClick={() => setShowAddBill(true)}>+ Add Bill</button>
      </div>
      {loading ? (
        <div style={{display:'flex',flexDirection:'column',gap:'.8rem'}}>
          {[1,2,3,4].map(i=><div key={i} className="skeleton" style={{height:'80px',borderRadius:'14px'}} />)}
        </div>
      ) : (
        <div className="bills-list">
          {bills.map(bill => {
            const renewDays = bill.renewal_date ? Math.round((new Date(bill.renewal_date).getTime() - Date.now()) / 86400000) : null
            const dueDay = bill.due_day_of_month
            const daysTilDue = dueDay ? dueDay - new Date().getDate() : null
            const progress = renewDays ? Math.min(100, Math.max(0, ((365-renewDays)/365)*100)) : 0
            const isUrgent = renewDays !== null && renewDays <= 60 && renewDays > 0
            const isExpanded = expanded === bill.id
            return (
              <div key={bill.id} className="bill-row">
                <div className="bill-main">
                  <div className="bill-ico" style={{background:`${bill.color}18`}}>{bill.icon}</div>
                  <div className="bill-info">
                    <div className="bill-name">{bill.name}</div>
                    <div className="bill-detail">
                      {bill.provider}
                      {renewDays !== null && (
                        <span> · <span style={{color:renewDays<=30?'var(--terra)':renewDays<=60?'var(--gold)':'var(--grey)',fontWeight:renewDays<=60?'700':'400'}}>
                          Renews in {renewDays}d
                        </span></span>
                      )}
                    </div>
                    {renewDays !== null && (
                      <div className="renew-bar">
                        <div className="renew-fill" style={{width:`${progress}%`,background:renewDays<=30?'var(--terra)':renewDays<=60?'var(--gold)':'var(--sage)'}} />
                      </div>
                    )}
                  </div>
                  <div className="bill-right">
                    <div className="bill-amt">{pence(bill.amount_pence)}/mo</div>
                    {daysTilDue !== null && (
                      <div className="bill-due" style={{color:Math.abs(daysTilDue)<=3?'var(--terra)':'var(--grey)'}}>
                        {daysTilDue >= 0 ? `Due in ${daysTilDue}d` : `${Math.abs(daysTilDue)}d ago`}
                      </div>
                    )}
                    {isUrgent && (
                      <button className="btn-solid" style={{marginTop:'.5rem',fontSize:'.68rem',padding:'.3rem .7rem'}}
                        onClick={() => searchDeals(bill)} disabled={searching[bill.id]}>
                        {searching[bill.id] ? '⏳ Searching…' : isExpanded ? 'Hide deals ▲' : '🔍 Find deals ▼'}
                      </button>
                    )}
                    {!isUrgent && <span style={{fontSize:'.7rem',color:'var(--grey)',display:'block',marginTop:'.3rem'}}>✓ No action needed yet</span>}
                    <div style={{display:'flex',gap:'.4rem',marginTop:'.5rem',justifyContent:'flex-end'}}>
                      <button className="chore-btn" style={{maxWidth:'38px',fontSize:'.85rem',padding:'.3rem'}} onClick={() => setEditBill(bill)} title="Edit">✏️</button>
                      <button className="chore-btn" style={{maxWidth:'38px',fontSize:'.85rem',padding:'.3rem',borderColor:'rgba(193,113,79,.2)',color:'var(--grey)'}} onClick={() => onDelete(bill.id)} title="Remove">🗑️</button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bill-expand">
                    <div style={{fontSize:'.8rem',fontWeight:'700',color:'var(--charcoal)',marginBottom:'.5rem'}}>
                      💡 AI-searched deals — ranked by savings vs your current {penceFull(bill.amount_pence)}/mo:
                    </div>
                    {searching[bill.id] ? (
                      <div className="searching-state">
                        <div className="spin" />
                        Searching MoneySupermarket, Compare the Market, Go Compare…
                      </div>
                    ) : deals[bill.id]?.length > 0 ? (
                      <div className="deals-grid">
                        {deals[bill.id].map((deal,i) => (
                          <div key={i} className="deal-card">
                            <div className="deal-provider">{deal.provider}</div>
                            <div className="deal-price">{pence(deal.monthly_amount_pence)}/mo</div>
                            <div className="deal-saving">💚 Save {pence(deal.saving_pence)}/mo</div>
                            <div className="deal-detail">{deal.detail}</div>
                            {deal.url && <button className="deal-cta" onClick={() => window.open(deal.url!,'_blank')}>View deal →</button>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{fontSize:'.8rem',color:'var(--grey)',padding:'.5rem 0'}}>
                        No deals found. Try <a href="https://moneysupermarket.com" target="_blank" rel="noreferrer" style={{color:'var(--terra)'}}>MoneySupermarket</a> or <a href="https://comparethemarket.com" target="_blank" rel="noreferrer" style={{color:'var(--terra)'}}>Compare the Market</a> directly.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MEALS TAB ────────────────────────────────────────────────────────────────
function MealsTab() {
  const [meals, setMeals] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [week, setWeek] = useState(0)
  const start = startOfToday()

  const load = async () => {
    setLoading(true)
    const startD = format(start, 'yyyy-MM-dd')
    const endD = format(addDays(start, 13), 'yyyy-MM-dd')
    const data = await getMealPlan(startD, endD)
    setMeals(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const generate = async () => {
    setGenerating(true)
    await fetch('/api/meals', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ startDate: format(start,'yyyy-MM-dd') }),
    })
    await load()
    setGenerating(false)
  }

  const days = Array.from({length:14}, (_,i) => addDays(start,i))
  const weekDays = days.slice(week*7, week*7+7)
  const todayKey = format(start,'yyyy-MM-dd')

  const mealMap: Record<string, Record<string, MealPlan>> = {}
  meals.forEach(m => {
    if (!mealMap[m.plan_date]) mealMap[m.plan_date] = {}
    mealMap[m.plan_date][m.slot] = m
  })

  const tagClass = (m: MealPlan) => m.source==='hf'?'mtag-hf':m.source==='gc'?'mtag-gc':'mtag-quick'
  const tagLabel = (m: MealPlan) => m.meal_tag==='hf'?'HelloFresh':m.meal_tag==='gc'?'Green Chef':'⚡ Quick'

  return (
    <div>
      <div className="section-hdr">
        <div>
          <h2 className="section-title">Meal <span>Planner</span></h2>
          <p className="section-sub">AI-generated · 2-week rolling · stored in Supabase</p>
        </div>
        <button className="btn-out" onClick={generate} disabled={generating}>
          {generating ? '⏳ Generating…' : '✨ Generate with AI'}
        </button>
      </div>
      <div className="week-tabs">
        <button className={`wtab ${week===0?'active':''}`} onClick={() => setWeek(0)}>
          Week 1 · {fmt(start)} – {fmt(addDays(start,6))}
        </button>
        <button className={`wtab ${week===1?'active':''}`} onClick={() => setWeek(1)}>
          Week 2 · {fmt(addDays(start,7))} – {fmt(addDays(start,13))}
        </button>
      </div>
      {loading ? (
        <div className="meal-grid">
          {[1,2,3,4,5,6,7].map(i=><div key={i} className="skeleton" style={{height:'160px',borderRadius:'12px'}} />)}
        </div>
      ) : meals.length === 0 ? (
        <div style={{textAlign:'center',padding:'3rem',color:'var(--grey)'}}>
          <div style={{fontSize:'2rem',marginBottom:'1rem'}}>🍽️</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:'1.2rem',marginBottom:'.5rem'}}>No meals planned yet</div>
          <div style={{fontSize:'.85rem',marginBottom:'1.5rem'}}>Click "Generate with AI" to create your 2-week plan</div>
          <button className="btn-solid" onClick={generate} disabled={generating}>
            {generating ? 'Generating…' : '✨ Generate Meal Plan'}
          </button>
        </div>
      ) : (
        <div className="meal-grid">
          {weekDays.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            const isToday = key === todayKey
            const lunch = mealMap[key]?.lunch
            const dinner = mealMap[key]?.dinner
            return (
              <div key={key} className={`meal-day${isToday?' today':''}`}>
                <div className="meal-day-hdr">
                  <div className="meal-day-name">{DAYS[day.getDay()]}</div>
                  <div className="meal-day-date">{fmt(day)}</div>
                </div>
                {[['lunch','Lunch',lunch],['dinner','Dinner',dinner]].map(([slot,label,meal]) => (
                  <div key={slot as string} className="meal-slot">
                    <div className="meal-slot-lbl">{label as string}</div>
                    {meal ? (
                      <>
                        <div className="meal-slot-name">{(meal as MealPlan).meal_name}</div>
                        <span className={`mtag ${tagClass(meal as MealPlan)}`}>{tagLabel(meal as MealPlan)}</span>
                      </>
                    ) : (
                      <div className="meal-empty">Not set</div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── AI TAB ───────────────────────────────────────────────────────────────────
type Message = { role: 'ai' | 'user'; text: string; time: string }

function AITab({ chores, bills, notifications }: { chores: any[]; bills: Bill[]; notifications: Notification[] }) {
  const [messages, setMessages] = useState<Message[]>([{
    role:'ai' as 'ai' | 'user',
    text:`Hello! 👋 I'm Hearth — your household AI.\n\nI'm connected to your Supabase database so I know exactly what's going on in your home right now. I track your real chore habits, watch your bill renewals, and can search for better deals.\n\nWhat can I help you with today?`,
    time: nowTime(),
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages])

  const homeContext = {
    chores: chores.map(c => ({
      name: c.name, room: c.room, assigned: c.assigned,
      status: choreStatus(c), daysUntil: daysUntilDue(c),
      learnedFreq: effectiveFreq(c), confidence: c.confidence_pct,
    })),
    bills: bills.map(b => ({
      name: b.name, provider: b.provider, amount: penceFull(b.amount_pence),
      renewalDate: b.renewal_date, daysUntilRenewal: b.renewal_date
        ? Math.round((new Date(b.renewal_date).getTime()-Date.now())/86400000) : null,
    })),
    urgentRenewals: bills.filter(b => b.renewal_date && Math.round((new Date(b.renewal_date).getTime()-Date.now())/86400000)<=60).map(b=>b.name),
    unreadNotifications: notifications.filter(n=>!n.is_read).length,
  }

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg = { role:'user' as 'ai' | 'user', text, time: nowTime() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages: newMsgs, homeContext }),
      })
      const data = await res.json()
      setMessages(p => [...p, { role:'ai', text: data.text, time: nowTime() }])
    } catch {
      setMessages(p => [...p, { role:'ai', text:'Sorry, connection issue. Please try again.', time: nowTime() }])
    }
    setLoading(false)
  }, [messages, loading, homeContext])

  return (
    <div>
      <div className="section-hdr">
        <div>
          <h2 className="section-title">Hearth <span>AI</span></h2>
          <p className="section-sub">Live home context from Supabase · searches deals · learns your habits</p>
        </div>
      </div>
      <div className="ai-wrap">
        <div className="ai-chat">
          <div className="ai-chat-hdr">
            <div className="ai-av">🏡</div>
            <div>
              <div className="ai-name-text">Hearth</div>
              <div className="ai-status"><div className="pulse" /> Connected to your home</div>
            </div>
          </div>
          <div className="ai-msgs" ref={msgsRef}>
            {messages.map((m,i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="msg-bub">{m.text}</div>
                <div className="msg-time">{m.time}</div>
              </div>
            ))}
            {loading && <div className="msg ai"><div className="msg-bub"><div className="typing-dots"><div className="tdot"/><div className="tdot"/><div className="tdot"/></div></div></div>}
          </div>
          <div className="ai-suggs">
            {SUGGS.map(s=><button key={s} className="ai-sugg" onClick={()=>send(s)}>{s}</button>)}
          </div>
          <div className="ai-input-area">
            <textarea className="ai-inp" placeholder="Ask Hearth anything about your home…"
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input)}}} rows={1} />
            <button className="ai-send" onClick={()=>send(input)} disabled={loading||!input.trim()}>➤</button>
          </div>
        </div>

        <div className="sidebar">
          <div className="notif-panel">
            <div className="notif-hdr">
              Notifications
              <span onClick={() => markAllNotificationsRead()}>Mark all read</span>
            </div>
            <div className="notif-list">
              {notifications.slice(0,12).map(n => (
                <div key={n.id} className={`notif-item ${!n.is_read?'unread':''}`}
                  onClick={() => markNotificationRead(n.id)}>
                  <div className="notif-ico">{n.icon}</div>
                  <div className="notif-body">
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-sub">{n.body}</div>
                    <div className="notif-time">{format(new Date(n.created_at),'d MMM, HH:mm')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="learn-panel">
            <div className="learn-title">🧠 Learning Engine</div>
            {chores.slice(0,7).map(c => (
              <div key={c.id} className="learn-item">
                <div>{c.icon} {c.name}</div>
                <div className="learn-item-r">
                  <div className="learn-days">~{effectiveFreq(c)}d</div>
                  <div className="learn-conf">{c.completions_count} pts · {c.confidence_pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ chores, bills, notifications, setTab }: any) {
  const overdue = chores.filter((c:any)=>choreStatus(c)==='overdue').length
  const soon = chores.filter((c:any)=>choreStatus(c)==='due-soon').length
  const urgentBills = bills.filter((b:any)=>b.renewal_date&&Math.round((new Date(b.renewal_date).getTime()-Date.now())/86400000)<=60).length
  const unread = notifications.filter((n:any)=>!n.is_read).length
  const h = new Date().getHours()
  const greeting = h<12?'Good morning':h<18?'Good afternoon':'Good evening'
  const topChores = [...chores].sort((a:any,b:any)=>daysUntilDue(a)-daysUntilDue(b)).slice(0,5)

  return (
    <div>
      <div className="greeting">
        <div className="gt">{greeting}, you two ☕</div>
        <div className="gs">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        <div className="gstats">
          <div><div className="gn">{overdue}</div><div className="gl">Overdue chores</div></div>
          <div><div className="gn">{soon}</div><div className="gl">Due this week</div></div>
          <div><div className="gn">{urgentBills}</div><div className="gl">Bills renewing soon</div></div>
          <div><div className="gn">{unread}</div><div className="gl">New alerts</div></div>
        </div>
      </div>

      {unread > 0 && (
        <div className="alerts-banner">
          {notifications.filter((n:any)=>!n.is_read).slice(0,3).map((n:any)=>(
            <div key={n.id} className="alert-item">
              <span style={{fontSize:'1.1rem'}}>{n.icon}</span>
              <div className="alert-text"><strong>{n.title}</strong> · <span style={{color:'var(--grey)'}}>{n.body}</span></div>
              <button className="alert-action" onClick={()=>markNotificationRead(n.id)}>Dismiss</button>
            </div>
          ))}
        </div>
      )}

      <div className="ov-grid">
        <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
          <div className="card">
            <div className="card-title"><span>🧹</span> Priority Chores</div>
            {topChores.map((c:any) => {
              const s = choreStatus(c); const d = daysUntilDue(c)
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:'.8rem',padding:'.65rem 0',borderBottom:'1px solid rgba(193,113,79,.07)'}}>
                  <span style={{fontSize:'1.1rem'}}>{c.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.87rem',fontFamily:"'Playfair Display',serif"}}>{c.name}</div>
                    <div style={{fontSize:'.7rem',color:'var(--grey)'}}>{c.room} · every ~{effectiveFreq(c)}d</div>
                  </div>
                  <span className={`badge ${s==='overdue'?'badge-overdue':s==='due-soon'?'badge-soon':'badge-ok'}`}>
                    {d<0?`${Math.abs(d)}d late`:d===0?'Today':`${d}d`}
                  </span>
                </div>
              )
            })}
            <button className="btn-out" style={{marginTop:'1rem',width:'100%'}} onClick={()=>setTab('chores')}>All chores →</button>
          </div>
          <div className="card">
            <div className="card-title"><span>💰</span> Renewals Radar</div>
            {bills.filter((b:any)=>b.renewal_date).sort((a:any,b:any)=>new Date(a.renewal_date).getTime()-new Date(b.renewal_date).getTime()).slice(0,5).map((b:any)=>{
              const d = Math.round((new Date(b.renewal_date).getTime()-Date.now())/86400000)
              return (
                <div key={b.id} style={{display:'flex',alignItems:'center',gap:'.8rem',padding:'.65rem 0',borderBottom:'1px solid rgba(193,113,79,.07)'}}>
                  <span style={{fontSize:'1.1rem'}}>{b.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'.87rem',fontFamily:"'Playfair Display',serif"}}>{b.name}</div>
                    <div style={{fontSize:'.7rem',color:'var(--grey)'}}>{b.provider}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <span style={{fontSize:'.8rem',fontWeight:'700',color:d<=30?'var(--terra)':d<=60?'var(--gold)':'var(--grey)'}}>{d}d</span>
                    {d<=60&&<div style={{fontSize:'.65rem',color:'var(--terra)'}}>Deals available</div>}
                  </div>
                </div>
              )
            })}
            <button className="btn-out" style={{marginTop:'1rem',width:'100%'}} onClick={()=>setTab('bills')}>View all bills →</button>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
          <div className="card">
            <div className="card-title"><span>🔔</span> Recent Alerts</div>
            {notifications.slice(0,5).map((n:any)=>(
              <div key={n.id} style={{display:'flex',gap:'.6rem',padding:'.5rem 0',borderBottom:'1px solid rgba(193,113,79,.07)'}}>
                <span style={{fontSize:'.95rem'}}>{n.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.8rem',fontWeight:'700',color:'var(--charcoal)'}}>{n.title}</div>
                  <div style={{fontSize:'.7rem',color:'var(--grey)',marginTop:'.1rem'}}>{n.body}</div>
                </div>
                {!n.is_read&&<div style={{width:'7px',height:'7px',borderRadius:'50%',background:'var(--terra)',marginTop:'4px',flexShrink:0}} />}
              </div>
            ))}
            <button className="btn-out" style={{marginTop:'1rem',width:'100%'}} onClick={()=>setTab('ai')}>Open Hearth AI →</button>
          </div>
          <div className="card">
            <div className="card-title"><span>🧠</span> Learning Status</div>
            {chores.slice(0,5).map((c:any)=>(
              <div key={c.id} style={{marginBottom:'.6rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'.73rem',marginBottom:'.2rem'}}>
                  <span>{c.icon} {c.name}</span>
                  <span style={{color:c.confidence_pct>66?'var(--sage)':c.confidence_pct>33?'var(--gold)':'var(--grey)',fontWeight:'700'}}>{c.confidence_pct}%</span>
                </div>
                <div className="learn-bar"><div className="learn-fill" style={{width:`${c.confidence_pct}%`}} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SETTINGS / NOTIFICATIONS TAB ─────────────────────────────────────────────
function SettingsTab({ household, onHouseholdUpdate }: { household: Household | null; onHouseholdUpdate: () => void }) {
  const [personAName, setPersonAName] = useState(''  )
  const [personBName, setPersonBName] = useState('')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [calUrl1, setCalUrl1] = useState('')
  const [calUrl2, setCalUrl2] = useState('')
  const [testing, setTesting] = useState(false)
  const [telegramSaved, setTelegramSaved] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [calSaved, setCalSaved] = useState(false)
  const [calError, setCalError] = useState('')
  const [busyDays, setBusyDays] = useState<string[]>([])
  const [calTesting, setCalTesting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load directly from Supabase so we always get fresh data including calendar URLs
  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from('households')
        .select('*')
        .eq('id', HOUSEHOLD_ID)
        .single()
      if (data) {
        setPersonAName(data.person_a_name || 'Person A')
        setPersonBName(data.person_b_name || 'Person B')
        setBotToken(data.telegram_bot_token || '')
        setChatId(data.telegram_chat_id || '')
        setCalUrl1(data.calendar_url_a || '')
        setCalUrl2(data.calendar_url_b || '')
        setLoaded(true)
      }
    }
    loadSettings()
  }, [])

  const saveNames = async () => {
    await supabase.from('households').update({
      person_a_name: personAName,
      person_b_name: personBName,
    }).eq('id', HOUSEHOLD_ID)
    setNameSaved(true)
    onHouseholdUpdate()
    setTimeout(() => setNameSaved(false), 3000)
  }

  const saveTelegram = async () => {
    setTesting(true)
    await supabase.from('households').update({
      telegram_bot_token: botToken,
      telegram_chat_id: chatId,
    }).eq('id', HOUSEHOLD_ID)
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId, message: `🏡 <b>Hearth Test</b>

Your Telegram notifications are working! You'll receive daily updates here at 8am every morning.` }),
    })
    setTesting(false)
    setTelegramSaved(true)
    onHouseholdUpdate()
    setTimeout(() => setTelegramSaved(false), 3000)
  }

  const saveAndTestCalendar = async () => {
    setCalTesting(true)
    setCalError('')
    try {
      // Save to Supabase first
      const { error: dbError } = await supabase.from('households').update({
        calendar_url_a: calUrl1 || null,
        calendar_url_b: calUrl2 || null,
      }).eq('id', HOUSEHOLD_ID)
      if (dbError) throw new Error('Database save failed: ' + dbError.message)

      // Then fetch busy days
      const params = new URLSearchParams()
      if (calUrl1) params.set('url1', calUrl1)
      if (calUrl2) params.set('url2', calUrl2)
      const res = await fetch(`/api/calendar?${params.toString()}`)
      const data = await res.json()
      if (data.error) throw new Error('Calendar fetch failed: ' + data.error)
      setBusyDays(data.busyDays || [])
      setCalSaved(true)
      onHouseholdUpdate()
      setTimeout(() => setCalSaved(false), 4000)
    } catch(err: any) {
      setCalError(err.message || 'Something went wrong — check your iCal URL')
    }
    setCalTesting(false)
  }

  return (
    <div>
      <div className="section-hdr">
        <div>
          <h2 className="section-title">Settings & <span>Notifications</span></h2>
          <p className="section-sub">Telegram setup · household preferences</p>
        </div>
      </div>

      <div className="setup-card">
        <div className="setup-title">📱 Telegram Push Notifications {telegramSaved ? '— ✓ Connected' : ''}</div>
        <p style={{fontSize:'.82rem',color:'rgba(245,240,232,.75)',marginTop:'.4rem'}}>
          Hearth sends daily summaries + urgent alerts (overdue chores, bills renewing soon) straight to your Telegram.
        </p>
        <div className="setup-steps">
          <div className="setup-step"><div className="step-num">1</div>Open Telegram → search <strong style={{color:'var(--gold-l)'}}>@BotFather</strong> → send /newbot → copy the token</div>
          <div className="setup-step"><div className="step-num">2</div>Start a chat with your new bot → then visit <strong style={{color:'var(--gold-l)'}}>api.telegram.org/bot[TOKEN]/getUpdates</strong> to find your chat_id</div>
          <div className="setup-step"><div className="step-num">3</div>Paste both below and click Save & Test</div>
        </div>
        <div className="setup-input-row">
          <input className="setup-inp" placeholder="Bot token (from BotFather)…" value={botToken} onChange={e=>setBotToken(e.target.value)} />
          <input className="setup-inp" placeholder="Chat ID (from getUpdates)…" value={chatId} onChange={e=>setChatId(e.target.value)} />
          <button className="btn-solid" style={{padding:'.6rem 1.2rem',fontSize:'.78rem',whiteSpace:'nowrap'}}
            onClick={saveTelegram} disabled={!botToken||!chatId||testing}>
            {testing?'Sending test…':telegramSaved?'✓ Saved & Tested':'Save & Test'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🏡 Household Details</div>
        <div className="form-row" style={{marginBottom:'1rem'}}>
          <div className="form-group">
            <label className="form-label">Person A name</label>
            <input className="form-input" defaultValue={household?.person_a_name || 'Person A'} />
          </div>
          <div className="form-group">
            <label className="form-label">Person B name</label>
            <input className="form-input" defaultValue={household?.person_b_name || 'Person B'} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Alert me this many days before renewal</label>
          <select className="form-input" defaultValue={household?.notify_days_before || 60} style={{maxWidth:'200px'}}>
            {[30,45,60,90].map(d=><option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <button className="btn-solid" style={{marginTop:'.5rem'}} onClick={saveNames}>{nameSaved ? '✓ Saved!' : 'Save Changes'}</button>
      </div>

      <div className="card" style={{marginTop:'1.2rem'}}>
        <div className="card-title">📅 Google Calendar — Away Day Detection</div>
        <p style={{fontSize:'.85rem',color:'var(--grey)',lineHeight:'1.6',marginBottom:'1rem'}}>
          Link your Google Calendar so Hearth knows when you're away. Chores due on busy days automatically move to the day before.
        </p>
        <div className="setup-steps" style={{marginBottom:'1rem'}}>
          <div className="setup-step" style={{color:'var(--charcoal)'}}>
            <div className="step-num" style={{background:'rgba(193,113,79,.15)',color:'var(--terra)'}}>1</div>
            Open <strong>Google Calendar</strong> on desktop → click the three dots next to your calendar name → <strong>Settings and sharing</strong>
          </div>
          <div className="setup-step" style={{color:'var(--charcoal)'}}>
            <div className="step-num" style={{background:'rgba(193,113,79,.15)',color:'var(--terra)'}}>2</div>
            Scroll to <strong>Integrate calendar</strong> → copy the <strong>Secret address in iCal format</strong> link
          </div>
          <div className="setup-step" style={{color:'var(--charcoal)'}}>
            <div className="step-num" style={{background:'rgba(193,113,79,.15)',color:'var(--terra)'}}>3</div>
            Paste it below. Tag any away events with words like <strong>away, holiday, out, travel</strong> so Hearth knows to move chores
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'.6rem',marginBottom:'.8rem'}}>
          <div>
            <label className="form-label">Person A — iCal URL</label>
            <input className="form-input" placeholder="https://calendar.google.com/calendar/ical/person-a..." value={calUrl1} onChange={e=>setCalUrl1(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Person B — iCal URL</label>
            <input className="form-input" placeholder="https://calendar.google.com/calendar/ical/person-b..." value={calUrl2} onChange={e=>setCalUrl2(e.target.value)} />
          </div>
          <button className="btn-solid" onClick={saveAndTestCalendar} disabled={(!calUrl1&&!calUrl2)||calTesting} style={{alignSelf:'flex-start',padding:'.5rem 1.2rem'}}>
            {calTesting?'Connecting…':calSaved?'✓ Connected — Refresh':'Connect Calendars'}
          </button>
        </div>
        {busyDays.length > 0 && (
          <div style={{marginTop:'1rem',padding:'.8rem 1rem',background:'rgba(122,158,126,.1)',borderRadius:'10px',border:'1px solid rgba(122,158,126,.2)'}}>
            <div style={{fontSize:'.78rem',fontWeight:'700',color:'var(--sage)',marginBottom:'.4rem'}}>📅 Away days detected in next 30 days:</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'.4rem'}}>
              {busyDays.map(d=>(
                <span key={d} style={{fontSize:'.72rem',padding:'.2rem .6rem',background:'white',borderRadius:'20px',border:'1px solid rgba(122,158,126,.3)',color:'var(--charcoal)'}}>
                  {new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
                </span>
              ))}
            </div>
            <div style={{fontSize:'.72rem',color:'var(--grey)',marginTop:'.5rem'}}>Chores due on these days will be moved to the day before automatically.</div>
          </div>
        )}
        {calSaved && busyDays.length === 0 && (
          <div style={{marginTop:'.8rem',padding:'.7rem 1rem',background:'rgba(122,158,126,.1)',borderRadius:'10px',border:'1px solid rgba(122,158,126,.2)',fontSize:'.78rem',color:'var(--sage)',fontWeight:'700'}}>
            ✓ Calendar URLs saved successfully. No away days found in the next 30 days — add events with a location lasting 6+ hours and they'll appear here.
          </div>
        )}
        {calError && (
          <div style={{marginTop:'.8rem',padding:'.7rem 1rem',background:'rgba(193,113,79,.08)',borderRadius:'10px',border:'1px solid rgba(193,113,79,.2)',fontSize:'.78rem',color:'var(--terra)'}}>
            ⚠️ {calError}
          </div>
        )}
        {!loaded && (
          <div style={{marginTop:'.5rem',fontSize:'.75rem',color:'var(--grey)'}}>Loading saved settings…</div>
        )}
      </div>

      <div className="card" style={{marginTop:'1.2rem'}}>
        <div className="card-title">📡 Cross-Device Access</div>
        <p style={{fontSize:'.85rem',color:'var(--grey)',lineHeight:'1.6',marginBottom:'1rem'}}>
          Both of you access Hearth on any device. Add it to your phone home screen for a native app feel.
        </p>
        <div style={{background:'var(--linen)',borderRadius:'10px',padding:'1rem',fontFamily:'monospace',fontSize:'.82rem',color:'var(--charcoal)'}}>
          {process.env.NEXT_PUBLIC_APP_URL || 'https://your-hearth-app.vercel.app'}
        </div>
        <div style={{marginTop:'.8rem',fontSize:'.78rem',color:'var(--grey)'}}>
          💡 Safari/Chrome → Share → Add to Home Screen
        </div>
      </div>
    </div>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('overview')
  const [chores, setChores] = useState<any[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState({ chores:true, bills:true, notifs:true })

  const loadAll = async () => {
    const [c, b, n, h] = await Promise.all([
      getChores(), getBills(), getNotifications(), getHousehold()
    ])
    setChores(c)
    setBills(b)
    setNotifications(n)
    setHousehold(h)
    setLoading({ chores:false, bills:false, notifs:false })
  }

  useEffect(() => {
    loadAll()
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission(), 3000)
    }
    // Realtime subscription - chore completions trigger re-fetch
    const channel = supabase
      .channel('hearth-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table:'chore_completions' }, () => {
        getChores().then(setChores)
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'notifications' }, () => {
        getNotifications().then(setNotifications)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleMarkDone = async (id: string) => {
    await markChoreDone(id)
    const updated = await getChores()
    setChores(updated)
    // Refresh notifications too
    const notifs = await getNotifications()
    setNotifications(notifs)
  }

  const handleAddChore = async (form: any) => {
    await addChore(form)
    const updated = await getChores()
    setChores(updated)
  }

  const handleEditChore = async (id: string, form: any) => {
    await updateChore(id, form)
    const updated = await getChores()
    setChores(updated)
  }

  const handleDeleteChore = async (id: string) => {
    if (!confirm('Remove this chore?')) return
    await deleteChore(id)
    const updated = await getChores()
    setChores(updated)
  }

  const handleAddBill = async (form: any) => {
    await addBill(form)
    const updated = await getBills()
    setBills(updated)
  }

  const handleEditBill = async (id: string, form: any) => {
    await updateBill(id, form)
    const updated = await getBills()
    setBills(updated)
  }

  const handleDeleteBill = async (id: string) => {
    if (!confirm('Remove this bill?')) return
    await deleteBill(id)
    const updated = await getBills()
    setBills(updated)
  }

  const overdue = chores.filter(c => choreStatus(c) === 'overdue').length
  const urgentBills = bills.filter(b => b.renewal_date && Math.round((new Date(b.renewal_date).getTime()-Date.now())/86400000)<=60).length
  const unread = notifications.filter(n => !n.is_read).length
  const today = new Date()

  const TABS = [
    { id:'overview', label:'Overview', icon:'🏡' },
    { id:'chores', label:'Chores', icon:'🧹', count: overdue },
    { id:'meals', label:'Meals', icon:'🍽️' },
    { id:'bills', label:'Bills & Deals', icon:'💰', count: urgentBills },
    { id:'ai', label:'Hearth AI', icon:'✨' },
    { id:'settings', label:'Settings', icon:'⚙️', count: unread },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: STYLE}} />
      <div className="app">
        <header className="hdr">
          <div className="hdr-brand">
            <div className="hdr-ico">🏡</div>
            <div>
              <div className="hdr-name">Hearth</div>
              <div className="hdr-sub">Household Intelligence</div>
            </div>
          </div>
          <div className="hdr-right">
            <button className="notif-btn" onClick={() => setTab('settings')}>
              🔔
              {unread > 0 && <span className="notif-dot" />}
            </button>
            <button className={`tg-badge ${household?.telegram_bot_token ? 'tg-on' : 'tg-off'}`}
              onClick={() => setTab('settings')}>
              {household?.telegram_bot_token ? '📱 Telegram ✓' : '📱 Setup Alerts'}
            </button>
            <div className="hdr-date">
              <strong>{today.toLocaleDateString('en-GB',{weekday:'long'})}</strong>
              {today.toLocaleDateString('en-GB',{day:'numeric',month:'long'})}
            </div>
          </div>
        </header>

        <nav className="nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
              {(t.count ?? 0) > 0 && <span className="nav-count">{t.count}</span>}
            </button>
          ))}
        </nav>

        <main className="main">
          {tab === 'overview' && <OverviewTab chores={chores} bills={bills} notifications={notifications} setTab={setTab} />}
          {tab === 'chores' && <ChoresTab chores={chores} loading={loading.chores} onMarkDone={handleMarkDone} onAdd={handleAddChore} onEdit={handleEditChore} onDelete={handleDeleteChore} />}
          {tab === 'meals' && <MealsTab />}
          {tab === 'bills' && <BillsTab bills={bills} loading={loading.bills} onAdd={handleAddBill} onEdit={handleEditBill} onDelete={handleDeleteBill} />}
          {tab === 'ai' && <AITab chores={chores} bills={bills} notifications={notifications} />}
          {tab === 'settings' && <SettingsTab household={household} onHouseholdUpdate={() => getHousehold().then(setHousehold)} />}
        </main>
      </div>
    </>
  )
}
