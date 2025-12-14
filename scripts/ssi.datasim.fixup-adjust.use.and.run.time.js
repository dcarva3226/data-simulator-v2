include("ssi.utils.js");

let getUseTime = function(mins, startHour, endHour) {
      
      let binaries = "";
      let useTime = getRandomizedArray(mins, startHour, endHour);      
      let runTime = [];
                               
      // Get the first/last non zero buckets to generate runTime
      let first = null, last = null;
      for (let x = 0; x < 24; x++) {
            if (!first && useTime[x] != 0)
                  first = x;
            if (useTime[x] != 0)
                  last = x;
      }      
      
      // Loop through each useTime bucket to write out runTime
      for (let i = 0; i < 24; i++) {
                              
            if (i >= startHour && i <= endHour) {
                  
                  let rt = 0;
                  let ut = parseInt(useTime[i]); // usage mins for cur hour
                  if (i == first || i == last) {
                        rt = this.rand(ut, 60, 0);
                  } else if (i > first && i < last) {
                        rt = 60;
                  }
                  
                  runTime[i] = rt;
            } else {

                  runTime[i] = 0;
            }
      }
            
      return [useTime, runTime];
      
};

let getRandomizedArray = function(total, startHour, endHour) {
      
      let tempArray = [];
      
      // Set initial array of hourly buckets in range (start to end hour)
      let arrySize = endHour - startHour
      for (let x = 0; x <= arrySize; x++) {
            tempArray.push(0);
      }
      
      let ansa = [];
      let required = total;
      let sum = 0;
      
      for (i = 0; i < tempArray.length; i++) {
          
            max = required - sum;            
            if (max > 60) max = 60;            
            
            //if (max > tempArray [i])
            //      max = tempArray [i];
            
            min = required - sum;
            if (min > 60) min = 60;
            
            for (j = i+1; j < tempArray.length; j++)
                  min = min - tempArray [j];
          
            if (min < 0) min = 0;

            if (min > max) {
                  total = 0;
                  // break; // Just in case
            }
          
            total = min + Math.floor (Math.random () * (max - min + 1)); 
            ansa [i] = total.toFixed(0);             
            sum = sum + total;                           
      }
      
      // Zero-pad the other hours
      let finalArray = [];
      ansa = shuffleArray(ansa);
      let ansaPtr = 0;
      for (y = 0; y < 24; y++) {
            
            if (y >= startHour && y <= endHour) {                  
                  finalArray[y] = ansa[ansaPtr];
                  ansaPtr++;
            } else {
                  finalArray[y] = 0;
            }
      }
      
      return finalArray;
      
};

// Randomize array values so that [10,9,8,0,0,0]
// becomes [9,0,10,0,8,0] instead
function shuffleArray(array) {
      
      for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
      }
      
      return array;
      
};

var entities = this.mgr.readLazily("cmdb_program_daily_usage", Criterion.GT("id", 4));

let cnt = 0;
while (entities.hasNext()) {
    if (jobHandle.isStopped()) throw "Cancelled...";

    var entity = entities.next();   
    var mins = entity.get("minutes_in_use");
    var useTime = getUseTime(mins, 8, 17);
    if (useTime) {
        entity.set("use_time", useTime[0].getBytes());
        entity.set("run_time", useTime[1].getBytes());
        entity.set("uptime_minutes", useTime[1].getSum());
        entity.save();    
    }    
         
    cnt++;

    jobState.onProgress(1.0, cnt);    
}

"Records processed: " + cnt;