Let's say we're writing a physics engine for a snowboarding game. The universe of the game has two dynamic materials: the snow and the board. We want our simulation to be rich and detailed, so we simulate both the snow and the board at a granual level. Snow particles and board particles need to be able to interact with themselves and collide against each other, as well as the static mountain mesh. The snow is soft and powerdery, which is easy to simulate (thankfully, since there's so much of it!). The snowboard is stiff and taut, which is difficult to simulate, but fortunately there's only one.

Of course we'll base our engine on Small Step XPBD. Small Step XPBD makes it really easy to efficiently trade off runtime performance for simulation accuracy by decreasing the simulator step size (which is equivalent to increasing the simulator frame rate). For something simple like the snow, we might be able to get away with running our sim at 250 steps per second. On the other hand, to simulate the board at the fidelity we'd like might require going all the way up to 5000 steps/second!

The standard way of supporting multiple materials with different step size needs is to set the overall simulator step size to the highest needed. In our case, however, this would result in updating the snow 5000 times a second, 20 times more than necessary. We're not writing Windows 11, here, so that's unacceptable inefficiency! What we want to be able to do is run the snow constraints at 250 steps a second, the board constraints at 5000 steps a second, and probably run the relatively small number of collision constraints between the snow and the board at the faster 5000 steps a second board rate, as well.



$$\Delta x = M^{-1} \nabla C \frac{-C}{\nabla C^T M^{-1} \nabla C + \alpha / h^2}$$
```math
\begin{split}
 f & = \frac{1}{h^2} M^{-1} \nabla C \frac{-C}{\nabla C^T M^{-1} \nabla C + \alpha / h^2} \\[5pt]
   & = M^{-1} \nabla C \frac{-C}{h^2 \nabla C^T M^{-1} \nabla C + \alpha}
\end{split}
```
