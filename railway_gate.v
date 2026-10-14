// Automatic Railway Gate Controller (educational, NOT a certified safety system)
// Logic mirrors the browser simulator: warning = A AND B, track clear = NOT A.

module and_gate(input a, input b, output y); assign y = a & b; endmodule
module or_gate (input a, input b, output y); assign y = a | b; endmodule
module not_gate(input a, output y);          assign y = ~a;    endmodule

module railway_gate #(
    parameter WARN_CYCLES  = 3,   // warning period before barrier lowers
    parameter CLEAR_CYCLES = 3    // warning hold after train clears
)(
    input  clk,
    input  rst,
    input  train_detect,   // A: approach/crossing sensor
    input  sys_active,     // B: system enable
    output reg warning_light,
    output reg barrier_down,
    output reg fault,      // sensor seen while system inactive
    output [1:0] state_out
);
    // Combinational logic gates
    wire warn_req, any_input, track_clear;
    and_gate g_and (.a(train_detect), .b(sys_active), .y(warn_req));
    or_gate  g_or  (.a(train_detect), .b(sys_active), .y(any_input));
    not_gate g_not (.a(train_detect), .y(track_clear));

    // FSM states
    localparam IDLE = 2'd0, WARN = 2'd1, CLOSED = 2'd2, HOLD = 2'd3;
    reg [1:0] state;
    reg [3:0] cnt;
    assign state_out = state;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            state <= IDLE; cnt <= 0;
            warning_light <= 0; barrier_down <= 0; fault <= 0;
        end else begin
            fault <= train_detect & ~sys_active;       // never report "safe" when inactive
            if (!sys_active) begin                      // inactive: drop everything, flag fault
                state <= IDLE; cnt <= 0; warning_light <= 0; barrier_down <= 0;
            end else case (state)
                IDLE: begin
                    warning_light <= 0; barrier_down <= 0; cnt <= 0;
                    if (warn_req) begin state <= WARN; warning_light <= 1; end
                end
                WARN: begin                              // lights on, barrier still up
                    warning_light <= 1;
                    if (cnt == WARN_CYCLES-1) begin state <= CLOSED; barrier_down <= 1; cnt <= 0; end
                    else cnt <= cnt + 1;
                end
                CLOSED: begin                            // barrier stays down while train present
                    warning_light <= 1; barrier_down <= 1;
                    if (track_clear) begin state <= HOLD; cnt <= 0; end
                end
                HOLD: begin                              // train cleared: brief warning, then raise
                    warning_light <= 1; barrier_down <= 1;
                    if (!track_clear) begin state <= CLOSED; cnt <= 0; end
                    else if (cnt == CLEAR_CYCLES-1) begin
                        state <= IDLE; warning_light <= 0; barrier_down <= 0; cnt <= 0;
                    end else cnt <= cnt + 1;
                end
            endcase
        end
    end
endmodule
