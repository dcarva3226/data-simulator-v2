/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.utilization.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 5/8/2024
=============================================================================================================*/


// Check to prevent duplication of hw utilization records
let checkForHwUtil = function(installedOn, targetDate) {
  
      let crit = new java.util.ArrayList();  
      crit.add(EQ("util.computer", installedOn));
      crit.add(EQ("util.usage_date", targetDate));
      
      let q = Query.select(java.util.Arrays.asList(Query.column("util.id", "id")));  
      q.from("cmdb_device_resource_util", "util");
      q.where(AND(crit));
      q.limit(1);
      return this.exec.execute1(q);
};


let startDate     = new java.util.Date("1/21/2024");
let endDate       = new java.util.Date("3/21/2024");
let days          = getDateDiff(startDate, endDate) + 1;
let targetDate    = new java.util.Date("1/21/2024");           
     
let tot = 0;

// Loop through each day in the date range            
for (let day = 1; day <= days; day++) {

      let cnt = 0;
      if (jobHandle.isStopped()) throw "Cancelled...";

      let dayCnt = (day > 1) ? 1 : 0;  
      targetDate.setDate(targetDate.getDate() + dayCnt);            
      if (this.excludedDay(targetDate, true)) continue;
      
      let crit = Criterion.AND(Criterion.EQ("cpu", 36),
                          Criterion.ILIKE("name", "%CORPVDI%"));
      
      // Read in computers
      let computers = mgr.readLazily("cmdb_ci_computer", crit);

// Total 256
let firstPerc = 160;
let secondPerc = 64;
let thirdPerc = 32;
      
      while (computers.hasNext()) {
          
            cnt++;
            tot++;
            if (jobHandle.isStopped()) throw "Cancelled...";
            
            let computer = computers.next();
            let installedOn = computer.get("id");
          
            let curPercentage
          
            if (!checkForHwUtil(installedOn, targetDate)) {

                  let util = this.mgr.create("cmdb_device_resource_util");
                  util.set("computer", installedOn);
                  
                  if (cnt <= firstPerc) { 

                        util.set("processor_usage", rand(2, 20));
                        util.set("memory_usage", rand(31, 50));

                  } else if (cnt > firstPerc && cnt <= (firstPerc+secondPerc)) {

                        util.set("processor_usage", rand(21, 60));
                        util.set("memory_usage", rand(31, 63));

                  } else if (cnt > (firstPerc+secondPerc) && cnt <= (firstPerc+secondPerc+thirdPerc)) {         

                        util.set("processor_usage", rand(61, 99));
                        util.set("memory_usage", rand(38, 88));                  

                  }                  
                  
                  util.set("usage_date", targetDate);
                  util.save();
            }
            
            jobState.onProgress(1.0, tot);               
      }          
};

"Utilization records created: " + tot;
