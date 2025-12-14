/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.eux.events.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 9/3/2024
 @Notes: Schedule script to run daily so that fresh data is always available.
 
 o	The alerts need to happen over a variety of periods so that all the options from the time filter work, e.g. 
        Last 15 minutes all the way up to Last 7 Days. I’d suggest 40-50 per hour? 24 hours a day as the times are UTC 
        and we have global territories.
 o	We need a mixture of all alert types; we have 10 in total, and this is how I want them weighted (ish)
 o	High processor usage – 15%
 o	High memory usage – 20%
 o	Low disk free space (by percent) – See ssi.datasim.eux.disk.events.js
 o	Low disk free space (by size) – See ssi.datasim.eux.disk.events.js
 o	High drive usage – 5 %
 o	Weak Wi-Fi signal – 20%
 o	No Internet connection – 5%
 o 	Reboot pending to install updates – 20%
 o 	Antivirus status – 7.5%
 o	Firewall status – 7.5%

 They can be spread evenly across all locations, except:

 o	Half of all antivirus or firewall status alerts appear in PersonSet1 (is Australia on acumendemo)
 o	Half of all wifi signal, high process and high memory are in PersonSet2 (is India on acumendemo)
=============================================================================================================*/

const cfg = {
      debug         : "None",
      msgCancel	  : "The script has been manually cancelled...",
      hourly        : false,
      perHourLow    : 40, // Events per hour range start
      perHourHigh   : 50, // Events per hour range end
      wkndLimitLow  : 150, // Low limit total events on weekend day
      wkndLimitHigh : 200, // High limit total events on weekend day
      skipWknds     : false,
      update	  : true
};

const rpt = {
      err         : "None",
      totRecs     : 0
};

const getEventType = function(guid) {
      return this.getField("euxi_event_type", "id", "guid", guid);
};

const evt = {
      hpu         : getEventType("A2C0DDAE-98E5-45C7-821E-3083411000A3"),
      hmu         : getEventType("53B4DB9D-35D9-4829-9C5E-487E8A29C8B0"),
      ldfsp       : getEventType("00A1C088-D9EA-4612-8D66-1C5C643D9452"),
      ldfss       : getEventType("B1628CAA-D7BC-4CF3-9E46-954FD9C5557F"),
      hdu         : getEventType("96B9D44F-5237-4BBD-8C99-4D9290D4490E"),
      wws         : getEventType("3FDBE55B-4CFA-41EC-8C65-86172BD1C4D1"),
      nic         : getEventType("A5D4FFEC-FD68-4C9E-8848-30220224CCF1"),
      rpiu        : getEventType("6338C34D-14C0-4F1D-BE2D-2D1E851253E5"),
      naa         : getEventType("341D9195-41BB-499A-BE4D-BA7785A849C5"),
      naf         : getEventType("2DC99AC3-E439-4ECF-8B96-FC3DD623941B")
};

const locations = ["Undefined", "Hudson Tower", "UK Headquarters", "US Headquarters"];

let run = function() {

      let oldDate = new java.util.Date();
      oldDate.setDate(oldDate.getDate() - 91);
      let deleter = dbApi.createBatchDelete("euxi_event");
      deleter.delete_(Criterion.LT("begin_time", oldDate));

      let startDate = new java.util.Date();
      let endDate   = new java.util.Date();

      let cols = new java.util.ArrayList();
      cols.add(Query.column("u.id", "user"));      
      cols.add(Query.column("c.id", "computer"));
      cols.add(Query.column("ag.name", "location"));
      cols.add(Query.column("p.location", "locationid"));        

      jobState.onProgress(1.0, "Running query to read person data...");		
      let q = Query.selectDistinct(cols);
      q.from("cmn_person", "p");
      q.join("cmn_user", "u", "u.person", "p.id");
      q.join("cmdb_ci_computer", "c", "c.primary_user", "u.id");
      q.join("acu_group_person", "agp", "agp.person", "p.id");
      q.join("acu_group", "ag", "ag.id", "agp.group");
      q.join("acu_group_type", "agt", "agt.id", "ag.type");
      q.where(AND(IN("ag.name", this.locations), EQ("agt.name", "Location")));
      let personsAll = this.exec.executeLM(q);
     
      q.where(AND(EQ("ag.name", "Undefined"), EQ("agt.name", "Location")));
      let personSet1 = this.exec.executeLM(q); 

      q.where(AND(EQ("ag.name", "Hudson Tower"), EQ("agt.name", "Location")));
      let personSet2 = this.exec.executeLM(q);    

      q.where(AND(NOT_IN("ag.name", ["Undefined", "Hudson Tower"]), EQ("agt.name", "Location")));
      let personsExclusive = this.exec.executeLM(q);      

      let days = getDateDiff(startDate, endDate) + 1;
            
      for (let y = 0; y < days; y++) {
            
            let curDayRecs = 0;
            let weekendLimit = rand(cfg.wkndLimitLow, cfg.wkndLimitHigh, 0);
            let curDate = new java.util.Date(startDate);
            curDate.setDate(curDate.getDate() + y);     
            if (this.excludedDay(curDate, cfg.skipWknds)) continue; 

            // Loop through specific hours of each day
            for (let i = 0; i <= 23; i++) {
                 
                  if (!cfg.skipWknds && this.isWeekend(curDate)) {
                        if (curDayRecs >= weekendLimit) break;
                  }

                  let percentage = ((y / days) * 100.0);
                  jobState.onProgress(percentage, String.format("Processing hour {0} for date {1}...",
                        i,
                        curDate));
                  
                  let cnt = [0,0,0,0,0,0,0,0,0,0];

                  // Create X number of events each day
                  let flip = 0;
                  let numEvents = rand(cfg.perHourLow, cfg.perHourHigh, 0);
                  
                  for (let x = 0; x < numEvents; x++) {
                        
                        if (jobHandle.isStopped()) throw cfg.msgCancel;                        

                        // Determine which event is needed based on %
                        if ((cnt[0] / numEvents) < .14) {
                              eventType = evt.hpu;
                              cnt[0]++;
                        } else if ((cnt[1] / numEvents) < .19) {
                              eventType = evt.hmu;
                              cnt[1]++;
                        } else if ((cnt[4] / numEvents) < .04) {
                              eventType = evt.hdu;
                              cnt[4]++;
                        } else if ((cnt[5] / numEvents) < .19) {
                              eventType = evt.wws;
                              cnt[5]++;
                        } else if ((cnt[6] / numEvents) < .04) {
                              eventType = evt.nic;
                              cnt[6]++;
                        } else if ((cnt[7] / numEvents) < .19) {
                              eventType = evt.rpiu;
                              cnt[7]++;
                        } else if ((cnt[8] / numEvents) < .07) {
                              eventType = evt.naa;
                              cnt[8]++;
                        } else if ((cnt[9] / numEvents) < .07) {
                              eventType = evt.naf;
                              cnt[9]++;
                        }                        
                        
                        let person = null;
                        
                        // Half of these events are either Australia or India
                        if (eventType == evt.naa || eventType == evt.naf) {
                              if (flip == 0) {
                                    person = personSet1[rand(0, personSet1.length-1, 0)];
                                    flip = 1;
                              } else {
                                    person = personsExclusive[rand(0, personsExclusive.length-1, 0)];
                                    flip = 0;
                              }
                        } else if (eventType == evt.wws || eventType == evt.hpu || eventType == evt.hmu) {
                              if (flip == 0) {
                                    person = personSet2[rand(0, personSet2.length-1, 0)];
                                    flip = 1;                                    
                              } else {
                                    person = personsExclusive[rand(0, personsExclusive.length-1, 0)];
                                    flip = 0;
                              }
                        } else {
                              person = personsAll[rand(0, personsAll.length-1, 0)];
                        }
                        
                        let user = person["user"];
                        let computer = person["computer"];     
                        let loc = person["locationid"];
                        let stHour = this.rand(i, 23, 0);
                        let edHour = stHour + this.rand(0, 1, 0);
                        let stMin = this.rand(0, 30, 0);
                        let edMin = this.rand(0, 59, 0);                  
                        if (stHour == edHour) edMin = stMin + this.rand(1, 30, 0);
                        let stSec = this.rand(1, 59, 0);
                        let edSec = this.rand(1, 59, 0);
                        
                        let startTs = this.buildDate(curDate, stHour, stMin, stSec);                 
                        let exists = this.mgr.readEntity("euxi_event", AND(EQ("begin_time", startTs), EQ("computer", computer)));
                        if (exists) {
                              startTs = this.buildDate(curDate, stHour, stMin, stSec-1);
                        }     
                        
                        let endTs = this.buildDate(curDate, edHour, edMin, edSec);
                        let entity = this.mgr.create("euxi_event");
                        entity.set("begin_time", startTs);
                        entity.set("end_time", endTs);
                        entity.set("location", loc);
                        entity.set("computer", computer);
                        entity.set("user", user);                                                                 
                        entity.set("type", eventType);
                        entity.set("os_name", getOSInfo(computer, 0));
                        entity.set("os_version", getOSInfo(computer, 1));
                        if (cfg.update) entity.save();
                        curDayRecs++;
                        rpt.totRecs++;
                  }
            }
      }
};


let getOSInfo = function(computer, type) {
 
      let col = null;

      if (type == 0)
            col = Query.column("osv.friendly_name", "val");
      else
            col = Query.column("osv.version", "val");

      let q = Query.select(java.util.Arrays.asList(col));
      q.from("cmdb_ci_computer", "c");
      q.join("cmdb_os_version", "osv", "osv.id", "c.os_ver");
      q.where(Criterion.EQ("c.id", computer));
      q.limit(1);
      return this.exec.execute1(q);
      
};

/*
let getLocation = function(name) { 
    
      switch (name) {
            case "UK" :
                  name = "UNITED KINGDOM";
                  break;
            case "US" :
                  name = "UNITED STATES";
                  break;
      }
    
      let q = Query.selectDistinct(Query.column("l.id", "id"));
      q.from("cmn_location", "l");
      q.join("cmn_city", "c", "c.id", "l.city");
      q.join("cmn_region", "r", "r.id", "c.region");
      q.join("cmn_country", "cn", "cn.id", "r.country");
      q.where(ILIKE("cn.name", name));
      q.limit(1);
      return this.exec.execute1(q);      
};
*/

/* ----------------------------------------------------------------------------------------------------------------

 STARTING POINT

---------------------------------------------------------------------------------------------------------------- */ 
run();

/*
try {
  
	if (!jobHandle.isStopped()) {
		run();    
	} else {
		rpt.err = cfg.msgCancel;
	}     
  
} catch (e) {
  
	rpt.err = e;
  
} finally {
  
	let result = String.format("Records created: {0}, last error: {1}, update flag = {2}, debug={3}", 
		rpt.totRecs,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};
*/