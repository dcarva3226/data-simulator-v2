// Read in a % of utilization data and increase usage

include("ssi.utils.js");

const group = "Australia";

let cnt1 = 0;
let cnt2 = 0;

let list = new java.util.ArrayList();
list.add(Query.column("r.id", "id"));

let crits = new java.util.ArrayList();
crits.add(EQ("g.name", group));
crits.add(EQ("g.type", 4));
crits.add(OR(Criterion.LT("r.processor_usage", 62), Criterion.LT("r.memory_usage", 62)));

let q = Query.select(list);
q.from("cmdb_device_resource_util", "r");
q.join("cmdb_ci_computer", "c", "c.id", "r.computer");
q.join("cmn_user", "u", "u.id", "c.primary_user");
q.join("acu_group_person", "gp", "gp.person", "u.person");
q.join("acu_group", "g", "g.id", "gp.group");
q.where(AND(crits));

let results = exec.executeL1(q);

for (let i = 0; i < results.length; i++) {

    if (jobHandle.isStopped()) throw "Manual script cancellation...";        
    let resId = results[i];
    
    // Let's change 1 out of 3 machines first
    cnt1++;
    if (this.rand(1, 3, 0) == 3) {
    
        let res = this.mgr.readEntity("cmdb_device_resource_util", EQ("id", resId));
        if (res) {
            res.set("processor_usage", this.rand(63, 68)); // 63-68 is a score of 6
            res.set("memory_usage", this.rand(63, 68)); // 63-68 is a score of 6
            res.save();    
            cnt2++;    
        }
    }    
}

cnt2 + " out of " + cnt1;