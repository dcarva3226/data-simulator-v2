/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.eux.disk.events.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 9/3/2024
 @Notes: Schedule script to run daily so that fresh data is always available. We only create LOW disk space
         events for preset # of machines.
 
 o	Low disk free space (by percent) – preset # of machines
 o	Low disk free space (by size) – preset # of machines
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

const LOWSPACE = [5, 8, 10];

const rpt = {
      diskAlreadySet : 0,      
      disksSet    : 0,
      err         : "None",
      totRecs     : 0
};

const getEventType = function(guid) {
      return this.getField("euxi_event_type", "id", "guid", guid);
};

const evt = {
      ldfsp       : getEventType("00A1C088-D9EA-4612-8D66-1C5C643D9452"),
      ldfss       : getEventType("B1628CAA-D7BC-4CF3-9E46-954FD9C5557F")
};

let run = function() {

      let startDate = new java.util.Date();
      let endDate   = new java.util.Date();

      let cols = new java.util.ArrayList();
      cols.add(Query.column("u.id", "user"));      
      cols.add(Query.column("c.id", "computer"));
      cols.add(Query.column("ag.name", "location"));
      cols.add(Query.column("p.location", "locationid"));        

      jobState.onProgress(1.0, "Running query to read person data...");		
      let q = Query.select(cols);
      q.from("cmn_person", "p");
      q.join("cmn_user", "u", "u.person", "p.id");
      q.join("cmdb_ci_computer", "c", "c.primary_user", "u.id");
      q.join("acu_group_person", "agp", "agp.person", "p.id");
      q.join("acu_group", "ag", "ag.id", "agp.group");
      q.join("acu_group_type", "agt", "agt.id", "ag.type");
      q.where(AND(EQ("agt.name", "Location"), Criterion.LIKE("c.name", "%CORP%")));      
      q.orderBy("p.id", Order.ASC)
      q.limit(108);
      let persons = this.exec.executeLM(q);    

      let days = getDateDiff(startDate, endDate) + 1;
            
      for (let y = 0; y < days; y++) {
            
            let curDayRecs = 0;
            let weekendLimit = rand(cfg.wkndLimitLow, cfg.wkndLimitHigh, 0);
            let curDate = new java.util.Date(startDate);
            curDate.setDate(curDate.getDate() + y);     
            if (this.excludedDay(curDate, cfg.skipWknds)) continue; 
               
            if (!cfg.skipWknds && this.isWeekend(curDate)) {
                if (curDayRecs >= weekendLimit) break;
            }

            let percentage = ((y / days) * 100.0);
            jobState.onProgress(percentage, "Processing day " + curDate);
                            
            // Loop through the X # of persons
            for (let x = 0; x < persons.length; x++) {
                
                if (jobHandle.isStopped()) throw cfg.msgCancel;                                              
                
                let person = persons[x];         
                
                let user = person["user"];
                let computer = person["computer"];     
                let loc = person["locationid"];
                let stHour = this.rand(0, 23, 0);
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
                entity.set("type", evt.ldfsp);
                entity.set("os_name", getOSInfo(computer, 0));
                entity.set("os_version", getOSInfo(computer, 1));
                if (cfg.update) entity.save();

                entity = this.mgr.create("euxi_event");
                entity.set("begin_time", startTs);
                entity.set("end_time", endTs);
                entity.set("location", getLocation(loc));
                entity.set("computer", computer);
                entity.set("user", user);                                                                 
                entity.set("type", evt.ldfss);
                entity.set("os_name", getOSInfo(computer, 0));
                entity.set("os_version", getOSInfo(computer, 1));
                if (cfg.update) entity.save();
                       
                let dq = Query.select(java.util.Arrays.asList(Query.column("ld.id")));
                dq.from("cmdb_ci_logical_disk", "ld");
                dq.where(Criterion.AND(Criterion.EQ("installed_on", computer), Criterion.EQ("operational", true)));
                dq.limit(1);
                let diskId = this.exec.execute1(dq);

                if (diskId) {
                    let disk = this.mgr.readEntity("cmdb_ci_logical_disk", Criterion.EQ("id", diskId));
                    let fs  = disk.get("disk_space");
                    if (fs > 10) {
                        let freeSpace = LOWSPACE[this.rand(0, 2, 0)];                  
                        disk.set("free_space", parseFloat(freeSpace));      
                        if (cfg.update) disk.save();
                        rpt.disksSet++;
                    } else {
                        rpt.diskAlreadySet++;
                    }
                }

                curDayRecs++;
                rpt.totRecs++;
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
try {
  
	if (!jobHandle.isStopped()) {
		run();    
	} else {
		rpt.err = cfg.msgCancel;
	}     
  
} catch (e) {
  
	rpt.err = e;
  
} finally {
  
	let result = String.format("Records created: {0}, disks updated: {1}, disk already set: {2}, last error: {3}, update flag = {4}, debug={5}", 
		rpt.totRecs,
            rpt.disksSet,
            rpt.diskAlreadySet,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};