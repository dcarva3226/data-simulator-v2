/*
      Reads all program daily usage record specified by criteria, near line 94, and reworks focus minutes.
      This is useful for resetting focus minutes if a usage record was modified. (i.e. minutes in use increased)
*/

include("ssi.utils.js");

let getFocusMins = function(useTime) {
      
      let binaries = "";
      let focusMinsEmpty = true;
                 
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
                              
            if (i >= first && i <= last) {
                  
                  let rt = 0;
                  let ut = parseInt(useTime[i]); // usage mins for cur hour                   
                            
                  if (i == first || i == last) {
                        rt = this.rand(ut, 60, 0);
                  } else if (i > first && i < last) {
                        rt = 60;
                  }
                  
                  let minCnt = ut;
                  
                  // Create focus minutes
                  for (var y = 0; y < 8; y++) {
                        
                        if (ut == 60) {
                              
                              if (y != 7) {
                                    binaries += "11111111";
                              } else {
                                    binaries += "1111";
                              }
                              
                              focusMinsEmpty = false;
                              
                        } else if (ut == 0) {
                              
                              if (y != 7) {
                                    binaries += "00000000";
                              } else {
                                    binaries += "0000";
                              }
                              
                        } else {
                              
                              let curBinary = ""
                              for (let x = (y!=7) ? 0 : 4; x < 8; x++) {
                                    curBinary += (minCnt > 0) ? 1 : 0;
                                    minCnt--;
                              }
                              
                              binaries += curBinary;                                    
                              focusMinsEmpty = false;                                   
                        }                             
                  }                                    
                  
            } else {

                  binaries += "000000000000000000000000000000000000000000000000000000000000";
            }
      }
      
      // Break out the binary string into 180 hex buckets
      let focusMins = [];
      let start = 0, end = 8;
      
      for (let z = 0; z < 180 && !focusMinsEmpty; z++) {
            let binary = binaries.substring(start, end);
            let hexValue = parseInt(binary, 2);
            focusMins.push(hexValue);
            start += 8;
            end += 8;
      }
      
      return (!focusMinsEmpty) ? focusMins : null;
      
};


var entities = this.mgr.readLazily("cmdb_program_daily_usage", Criterion.GT("id", 4));

let cnt = 0;
while (entities.hasNext()) {
    if (jobHandle.isStopped()) throw "Cancelled...";

    var entity = entities.next();   
    var useTime = entity.get("use_time");

    var focusMins = getFocusMins(useTime);
    if (focusMins) {
        entity.set("focus_minutes", focusMins.getBytes());
        entity.save();    
    }    
         
    jobState.onProgress(1.0, cnt);     
    cnt++;

    jobState.onProgress(1.0, cnt);    
}

"Records processed: " + cnt;