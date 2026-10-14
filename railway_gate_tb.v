`timescale 1ns/1ps
module railway_gate_tb;
    reg clk = 0, rst = 1, A = 0, B = 1;
    wire warn, bar, flt; wire [1:0] st;
    railway_gate dut(.clk(clk), .rst(rst), .train_detect(A), .sys_active(B),
                     .warning_light(warn), .barrier_down(bar), .fault(flt), .state_out(st));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("railway_gate.vcd"); $dumpvars(0, railway_gate_tb);
        $monitor("t=%0t A=%b B=%b state=%0d warn=%b bar=%b fault=%b", $time, A, B, st, warn, bar, flt);
        #20 rst = 0;
        #20 A = 1;            // train approaches: warning, then barrier lowers
        #100 A = 0;           // train cleared: hold, then raise
        #100 B = 0; A = 1;    // system inactive: fault, no false "safe"
        #30 A = 0; B = 1;
        #30 $finish;
    end
endmodule
